/*
 * habe_cli.c — JSON-in / JSON-out CLI wrapper for the HABE engine.
 *
 * The Node.js API Gateway spawns this binary as a child process and
 * communicates via stdin/stdout using newline-delimited JSON (NDJSON).
 *
 * Protocol:
 *   stdin  ← one JSON request object per line
 *   stdout → one JSON response object per line
 *   stderr → debug/error logs (not parsed by the API)
 *
 * Request format:
 *   { "cmd": "<command>", ...args }
 *
 * Commands and their args:
 *
 *   setup
 *     → { "ok": true }
 *
 *   create_dm
 *     { "child_pk": str, "parent_pk": str|null }
 *     parent_pk null  → parent is RM (depth-1 DM)
 *     parent_pk str   → parent is that DM
 *     → { "ok": true, "dm_pk": str }
 *
 *   create_user
 *     { "dm_pk": str, "user_pk": str, "attr_pk": str }
 *     → { "ok": true, "usk_id": str }
 *     usk_id is a handle: "<dm_pk>|<user_pk>|<attr_pk>" (used in decrypt)
 *
 *   encrypt
 *     { "plaintext_hex": str, "policy": { "clauses": [ ["attr1","attr2",...], ... ], "dm_pks": [str,...] } }
 *     → { "ok": true, "ct_hex": str }
 *
 *   decrypt
 *     { "ct_hex": str, "usk_ids": [str,...], "clause_idx": int }
 *     → { "ok": true, "plaintext_hex": str }
 *
 * State is held in-process. The API gateway spawns ONE persistent child
 * process per server lifetime and reuses it (persistent mode).
 *
 * Key store: keys are kept in memory in a flat array keyed by pk string.
 * For production, serialize to disk. This is intentionally simple.
 *
 * Build:
 *   gcc -O2 -I../include -o habe_cli habe_cli.c ../src/habe.c ../src/utils.c \
 *       -lpbc -lgmp -lssl -lcrypto -lm
 */

#include "habe.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

/* -----------------------------------------------------------------------
 * Minimal JSON helpers — no external dependency.
 * Handles the small, well-structured JSON we need.
 * ----------------------------------------------------------------------- */

/* Extract string value for a key from a flat JSON object.
 * Writes into buf (max buf_len). Returns 1 on success, 0 on failure. */
static int json_get_str(const char *json, const char *key,
                        char *buf, size_t buf_len)
{
    char search[256];
    snprintf(search, sizeof(search), "\"%s\"", key);
    const char *p = strstr(json, search);
    if (!p) return 0;
    p += strlen(search);
    while (*p == ' ' || *p == ':' || *p == ' ') p++;
    if (*p == '"') {
        p++;
        size_t i = 0;
        while (*p && *p != '"' && i < buf_len - 1) {
            if (*p == '\\' && *(p+1) == '"') { buf[i++] = '"'; p += 2; }
            else buf[i++] = *p++;
        }
        buf[i] = '\0';
        return 1;
    }
    return 0;
}

/* Extract integer value for a key. Returns 1 on success. */
static int json_get_int(const char *json, const char *key, int *out)
{
    char search[256];
    snprintf(search, sizeof(search), "\"%s\"", key);
    const char *p = strstr(json, search);
    if (!p) return 0;
    p += strlen(search);
    while (*p == ' ' || *p == ':') p++;
    if (*p == '-' || (*p >= '0' && *p <= '9')) {
        *out = atoi(p);
        return 1;
    }
    return 0;
}

/* Extract null-terminated array of strings from JSON array at key.
 * e.g. "dm_pks": ["a","b"] → strs[0]="a", strs[1]="b", count=2 */
static int json_get_str_array(const char *json, const char *key,
                              char strs[][HABE_MAX_ID_LEN], int max, int *count)
{
    char search[256];
    snprintf(search, sizeof(search), "\"%s\"", key);
    const char *p = strstr(json, search);
    if (!p) return 0;
    p += strlen(search);
    while (*p && *p != '[') p++;
    if (*p != '[') return 0;
    p++;
    *count = 0;
    while (*p && *p != ']' && *count < max) {
        while (*p == ' ' || *p == ',') p++;
        if (*p == '"') {
            p++;
            size_t i = 0;
            while (*p && *p != '"' && i < HABE_MAX_ID_LEN - 1)
                strs[*count][i++] = *p++;
            strs[*count][i] = '\0';
            if (*p == '"') p++;
            (*count)++;
        } else if (*p == ']') break;
        else p++;
    }
    return 1;
}

/* Extract array of string arrays (2D) from JSON.
 * "clauses": [["a1","a2"],["b1"]]
 * → clauses[0][0]="a1", clauses[0][1]="a2", n[0]=2
 *    clauses[1][0]="b1",                     n[1]=1 */
static int json_get_clauses(const char *json,
                            char clauses[][HABE_MAX_ATTRS][HABE_MAX_ID_LEN],
                            int n[], int *N)
{
    const char *p = strstr(json, "\"clauses\"");
    if (!p) return 0;
    p += strlen("\"clauses\"");
    while (*p && *p != '[') p++;
    if (*p != '[') return 0;
    p++; /* skip outer '[' */
    *N = 0;

    while (*p && *N < HABE_MAX_CLAUSES) {
        while (*p == ' ' || *p == ',') p++;
        if (*p == ']') break;         /* end of outer array */
        if (*p != '[') { p++; continue; }
        p++;                           /* skip inner '[' */
        n[*N] = 0;
        while (*p && n[*N] < HABE_MAX_ATTRS) {
            while (*p == ' ' || *p == ',') p++;
            if (*p == ']') { p++; break; }
            if (*p == '"') {
                p++;
                size_t i = 0;
                while (*p && *p != '"' && i < HABE_MAX_ID_LEN - 1)
                    clauses[*N][n[*N]][i++] = *p++;
                clauses[*N][n[*N]][i] = '\0';
                if (*p == '"') p++;
                n[*N]++;
            } else p++;
        }
        (*N)++;
    }
    return 1;
}

/* -----------------------------------------------------------------------
 * Hex encode/decode for plaintext and ciphertext transport
 * ----------------------------------------------------------------------- */
static int hv(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static void bytes_to_hex(const uint8_t *in, size_t len, char *out)
{
    static const char h[] = "0123456789abcdef";
    for (size_t i = 0; i < len; i++) {
        out[2*i]   = h[in[i] >> 4];
        out[2*i+1] = h[in[i] & 0xf];
    }
    out[2*len] = '\0';
}

static int hex_to_bytes(const char *hex, uint8_t *out, size_t expected)
{
    size_t len = strlen(hex);
    if (len != expected * 2) return 0;
    for (size_t i = 0; i < expected; i++) {
        int h = hv(hex[2*i]), l = hv(hex[2*i+1]);
        if (h < 0 || l < 0) return 0;
        out[i] = (uint8_t)((h << 4) | l);
    }
    return 1;
}

/* -----------------------------------------------------------------------
 * In-memory key store
 * ----------------------------------------------------------------------- */
#define MAX_DM_KEYS   32
#define MAX_USK_KEYS  128

typedef struct {
    char              pk[HABE_MAX_ID_LEN];
    HABEDomainMasterKey mk;
    int               in_use;
} DMEntry;

typedef struct {
    char              usk_id[HABE_MAX_ID_LEN * 3 + 2]; /* dm|user|attr */
    HABEUserSecretKey usk;
    int               in_use;
} USKEntry;

static DMEntry  dm_store[MAX_DM_KEYS];
static USKEntry usk_store[MAX_USK_KEYS];
static int      dm_count  = 0;
static int      usk_count = 0;

static DMEntry *dm_find(const char *pk)
{
    for (int i = 0; i < dm_count; i++)
        if (dm_store[i].in_use && strcmp(dm_store[i].pk, pk) == 0)
            return &dm_store[i];
    return NULL;
}

static DMEntry *dm_alloc(const char *pk)
{
    if (dm_count >= MAX_DM_KEYS) return NULL;
    DMEntry *e = &dm_store[dm_count++];
    memcpy(e->pk, pk, HABE_MAX_ID_LEN - 1);
    e->pk[HABE_MAX_ID_LEN - 1] = '\0';
    e->in_use = 1;
    return e;
}

static USKEntry *usk_find(const char *id)
{
    for (int i = 0; i < usk_count; i++)
        if (usk_store[i].in_use && strcmp(usk_store[i].usk_id, id) == 0)
            return &usk_store[i];
    return NULL;
}

static USKEntry *usk_alloc(const char *id)
{
    if (usk_count >= MAX_USK_KEYS) return NULL;
    USKEntry *e = &usk_store[usk_count++];
    memcpy(e->usk_id, id, sizeof(e->usk_id) - 1);
    e->usk_id[sizeof(e->usk_id) - 1] = '\0';
    e->in_use = 1;
    return e;
}

/* -----------------------------------------------------------------------
 * Ciphertext serialization — simple binary format:
 *   4 bytes: nA
 *   4 bytes: N (clauses)
 *   For each clause i:
 *     4 bytes: n[i]
 *     4 bytes: chain_len[i]
 *     for each chain k: element bytes (G1)
 *     element bytes: U_attr[i]
 *   element bytes: U0
 *   32 bytes: V
 *
 * We use element_to_bytes / element_from_bytes for portability.
 * ----------------------------------------------------------------------- */
#define CT_BUF_MAX (1024 * 64)  /* 64KB max ciphertext */

static int ct_serialize(HABEParams *params, HABECiphertext *ct,
                        uint8_t *buf, size_t *out_len)
{
    (void)params;
    uint8_t *p = buf;
    size_t rem = CT_BUF_MAX;

#define WRITE4(v) do { \
    if (rem < 4) return -1; \
    uint32_t _v = (uint32_t)(v); \
    p[0]=(_v>>24)&0xff; p[1]=(_v>>16)&0xff; p[2]=(_v>>8)&0xff; p[3]=_v&0xff; \
    p+=4; rem-=4; } while(0)

#define WRITE_ELEM(e) do { \
    int _n = element_length_in_bytes(e); \
    if ((size_t)_n > rem) return -1; \
    element_to_bytes(p, e); p += _n; rem -= _n; } while(0)

    WRITE4(ct->nA);
    WRITE4(ct->policy.N);

    /* Store G1 element size once (all G1 elements same size in Type A) */
    int g1_size = element_length_in_bytes(ct->U0);
    WRITE4(g1_size);

    WRITE_ELEM(ct->U0);

    for (int i = 0; i < ct->policy.N; i++) {
        WRITE4(ct->policy.n[i]);
        WRITE4(ct->U_chain_len[i]);
        for (int k = 0; k < ct->U_chain_len[i]; k++)
            WRITE_ELEM(ct->U_chain[i][k]);
        WRITE_ELEM(ct->U_attr[i]);
        /* Store attr_ids for each attribute in this clause */
        for (int j = 0; j < ct->policy.n[i]; j++) {
            uint32_t slen = (uint32_t)strlen(ct->policy.attr_ids[i][j]) + 1;
            WRITE4(slen);
            if (slen > rem) return -1;
            memcpy(p, ct->policy.attr_ids[i][j], slen);
            p += slen; rem -= slen;
        }
        /* dm_pk for this clause */
        uint32_t dlen = (uint32_t)strlen(ct->policy.dm_pk[i]) + 1;
        WRITE4(dlen);
        if (dlen > rem) return -1;
        memcpy(p, ct->policy.dm_pk[i], dlen);
        p += dlen; rem -= dlen;
    }

    /* V */
    if (HABE_PLAINTEXT_LEN > (int)rem) return -1;
    memcpy(p, ct->V, HABE_PLAINTEXT_LEN);
    p += HABE_PLAINTEXT_LEN;

    *out_len = (size_t)(p - buf);
    return 0;
#undef WRITE4
#undef WRITE_ELEM
}

static int ct_deserialize(HABEParams *params, const uint8_t *buf, size_t len,
                          HABECiphertext *ct)
{
    const uint8_t *p = buf;
    size_t rem = len;

#define READ4(v) do { \
    if (rem < 4) return -1; \
    (v) = ((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3]; \
    p+=4; rem-=4; } while(0)

#define READ_ELEM(e, grp) do { \
    if ((size_t)g1_size > rem) return -1; \
    element_init_##grp(e, params->pairing); \
    element_from_bytes(e, (unsigned char*)p); \
    p += g1_size; rem -= g1_size; } while(0)

    uint32_t nA, N, g1_size_u;
    READ4(nA); ct->nA = (int)nA;
    READ4(N);  ct->policy.N = (int)N;
    READ4(g1_size_u);
    int g1_size = (int)g1_size_u;

    READ_ELEM(ct->U0, G1);

    for (int i = 0; i < ct->policy.N; i++) {
        uint32_t ni, cl;
        READ4(ni); ct->policy.n[i] = (int)ni;
        READ4(cl); ct->U_chain_len[i] = (int)cl;
        for (int k = 0; k < ct->U_chain_len[i]; k++)
            READ_ELEM(ct->U_chain[i][k], G1);
        READ_ELEM(ct->U_attr[i], G1);
        for (int j = 0; j < ct->policy.n[i]; j++) {
            uint32_t slen; READ4(slen);
            if (slen > rem || slen > HABE_MAX_ID_LEN) return -1;
            memcpy(ct->policy.attr_ids[i][j], p, slen);
            p += slen; rem -= slen;
        }
        uint32_t dlen; READ4(dlen);
        if (dlen > rem || dlen > HABE_MAX_ID_LEN) return -1;
        memcpy(ct->policy.dm_pk[i], p, dlen);
        p += dlen; rem -= dlen;
    }

    if (HABE_PLAINTEXT_LEN > (int)rem) return -1;
    memcpy(ct->V, p, HABE_PLAINTEXT_LEN);

    return 0;
#undef READ4
#undef READ_ELEM
}

/* -----------------------------------------------------------------------
 * Response helpers
 * ----------------------------------------------------------------------- */
static void respond_ok(const char *extra_kv)
{
    if (extra_kv && *extra_kv)
        printf("{\"ok\":true,%s}\n", extra_kv);
    else
        printf("{\"ok\":true}\n");
    fflush(stdout);
}

static void respond_err(const char *msg)
{
    /* Escape quotes in msg for safety */
    printf("{\"ok\":false,\"error\":\"%s\"}\n", msg);
    fflush(stdout);
}

/* -----------------------------------------------------------------------
 * PBC pairing parameters (Type A, 80-bit)
 * ----------------------------------------------------------------------- */
static const char *TYPE_A_PARAMS =
    "type a\n"
    "q 8780710799663312522437781984754049815806883199414208211028653399266475630880"
    "222957078625179422662221423155858769582317459277713367317481324925129998224791\n"
    "h 12016012264891146079388821366740534204802954401251311822919615131047207289359"
    "704531102844802183906537786776\n"
    "r 730750818665451621361119245571504901405976559617\n"
    "exp2 159\n"
    "exp1 107\n"
    "sign1 1\n"
    "sign0 1\n";

/* -----------------------------------------------------------------------
 * Global state
 * ----------------------------------------------------------------------- */
static HABEParams        g_params;
static HABERootMasterKey g_rmk;
static int               g_initialized = 0;

/* -----------------------------------------------------------------------
 * Command handlers
 * ----------------------------------------------------------------------- */

static void cmd_setup(void)
{
    if (g_initialized) { respond_ok("\"note\":\"already initialized\""); return; }
    if (habe_setup(&g_params, &g_rmk, TYPE_A_PARAMS) != 0) {
        respond_err("setup failed"); return;
    }
    g_initialized = 1;
    respond_ok(NULL);
}

static void cmd_create_dm(const char *json)
{
    if (!g_initialized) { respond_err("not initialized"); return; }

    char child_pk[HABE_MAX_ID_LEN] = {0};
    char parent_pk[HABE_MAX_ID_LEN] = {0};
    if (!json_get_str(json, "child_pk", child_pk, sizeof(child_pk))) {
        respond_err("missing child_pk"); return;
    }
    int has_parent = json_get_str(json, "parent_pk", parent_pk, sizeof(parent_pk));

    if (dm_find(child_pk)) { respond_err("DM already exists"); return; }

    DMEntry *child = dm_alloc(child_pk);
    if (!child) { respond_err("dm_store full"); return; }

    int ret;
    if (!has_parent || parent_pk[0] == '\0' ||
        strcmp(parent_pk, "null") == 0) {
        /* depth-1: parent is RM */
        ret = habe_create_dm(&g_params, &g_rmk, NULL, child_pk, &child->mk);
    } else {
        DMEntry *parent = dm_find(parent_pk);
        if (!parent) { respond_err("parent_pk not found"); dm_count--; return; }
        ret = habe_create_dm(&g_params, NULL, &parent->mk, child_pk, &child->mk);
    }

    if (ret != 0) { respond_err("habe_create_dm failed"); dm_count--; return; }

    char extra[HABE_MAX_ID_LEN + 32];
    snprintf(extra, sizeof(extra), "\"dm_pk\":\"%s\"", child_pk);
    respond_ok(extra);
}

static void cmd_create_user(const char *json)
{
    if (!g_initialized) { respond_err("not initialized"); return; }

    char dm_pk[HABE_MAX_ID_LEN]   = {0};
    char user_pk[HABE_MAX_ID_LEN] = {0};
    char attr_pk[HABE_MAX_ID_LEN] = {0};

    if (!json_get_str(json, "dm_pk",   dm_pk,   sizeof(dm_pk))   ||
        !json_get_str(json, "user_pk", user_pk, sizeof(user_pk)) ||
        !json_get_str(json, "attr_pk", attr_pk, sizeof(attr_pk))) {
        respond_err("missing dm_pk/user_pk/attr_pk"); return;
    }

    DMEntry *dm = dm_find(dm_pk);
    if (!dm) { respond_err("dm_pk not found"); return; }

    char usk_id[HABE_MAX_ID_LEN * 3 + 2];
    snprintf(usk_id, sizeof(usk_id), "%s|%s|%s", dm_pk, user_pk, attr_pk);

    if (usk_find(usk_id)) { respond_err("user key already exists"); return; }

    USKEntry *entry = usk_alloc(usk_id);
    if (!entry) { respond_err("usk_store full"); return; }

    if (habe_create_user(&g_params, &dm->mk, user_pk, attr_pk, &entry->usk) != 0) {
        respond_err("habe_create_user failed"); usk_count--; return;
    }

    char extra[sizeof(usk_id) + 16];
    snprintf(extra, sizeof(extra), "\"usk_id\":\"%s\"", usk_id);
    respond_ok(extra);
}

static void cmd_encrypt(const char *json)
{
    if (!g_initialized) { respond_err("not initialized"); return; }

    char pt_hex[HABE_PLAINTEXT_LEN * 2 + 1] = {0};
    if (!json_get_str(json, "plaintext_hex", pt_hex, sizeof(pt_hex))) {
        respond_err("missing plaintext_hex"); return;
    }
    uint8_t plaintext[HABE_PLAINTEXT_LEN] = {0};
    if (!hex_to_bytes(pt_hex, plaintext, HABE_PLAINTEXT_LEN)) {
        respond_err("invalid plaintext_hex"); return;
    }

    /* Parse policy: clauses + dm_pks */
    char clauses[HABE_MAX_CLAUSES][HABE_MAX_ATTRS][HABE_MAX_ID_LEN];
    int  n[HABE_MAX_CLAUSES];
    int  N = 0;
    if (!json_get_clauses(json, clauses, n, &N) || N == 0) {
        respond_err("missing/invalid policy.clauses"); return;
    }

    char dm_pks[HABE_MAX_CLAUSES][HABE_MAX_ID_LEN];
    int  dm_pk_count = 0;
    if (!json_get_str_array(json, "dm_pks", dm_pks, HABE_MAX_CLAUSES, &dm_pk_count)
        || dm_pk_count != N) {
        respond_err("dm_pks count must match clauses count"); return;
    }

    /* Build policy struct */
    HABEPolicy policy;
    memset(&policy, 0, sizeof(policy));
    policy.N = N;
    for (int i = 0; i < N; i++) {
        policy.n[i] = n[i];
        for (int j = 0; j < n[i]; j++)
            strncpy(policy.attr_ids[i][j], clauses[i][j], HABE_MAX_ID_LEN - 1);
        strncpy(policy.dm_pk[i], dm_pks[i], HABE_MAX_ID_LEN - 1);
    }

    /* Resolve DM master keys */
    HABEDomainMasterKey *dm_mk_ptrs[HABE_MAX_CLAUSES];
    for (int i = 0; i < N; i++) {
        DMEntry *dm = dm_find(dm_pks[i]);
        if (!dm) { respond_err("dm_pk not found for clause"); return; }
        dm_mk_ptrs[i] = &dm->mk;
    }

    HABECiphertext ct;
    memset(&ct, 0, sizeof(ct));
    if (habe_encrypt(&g_params, plaintext, &policy,
                     (HABEDomainMasterKey **)dm_mk_ptrs, &ct) != 0) {
        respond_err("habe_encrypt failed"); return;
    }

    /* Serialize ciphertext */
    uint8_t ct_buf[CT_BUF_MAX];
    size_t  ct_len = 0;
    if (ct_serialize(&g_params, &ct, ct_buf, &ct_len) != 0) {
        habe_ciphertext_free(&ct);
        respond_err("ct_serialize failed"); return;
    }
    habe_ciphertext_free(&ct);

    /* Hex-encode */
    char *ct_hex = malloc(ct_len * 2 + 1);
    if (!ct_hex) { respond_err("malloc failed"); return; }
    bytes_to_hex(ct_buf, ct_len, ct_hex);

    /* Build response — print directly to avoid huge stack buffer */
    printf("{\"ok\":true,\"ct_hex\":\"%s\"}\n", ct_hex);
    fflush(stdout);
    free(ct_hex);
}

static void cmd_decrypt(const char *json)
{
    if (!g_initialized) { respond_err("not initialized"); return; }

    /* Read ct_hex — may be large, read into heap */
    const char *ct_start = strstr(json, "\"ct_hex\"");
    if (!ct_start) { respond_err("missing ct_hex"); return; }
    ct_start += strlen("\"ct_hex\"");
    while (*ct_start == ' ' || *ct_start == ':') ct_start++;
    if (*ct_start != '"') { respond_err("ct_hex not a string"); return; }
    ct_start++;
    const char *ct_end = strchr(ct_start, '"');
    if (!ct_end) { respond_err("ct_hex unterminated"); return; }
    size_t ct_hex_len = (size_t)(ct_end - ct_start);

    if (ct_hex_len % 2 != 0) { respond_err("ct_hex odd length"); return; }
    size_t ct_bin_len = ct_hex_len / 2;
    uint8_t *ct_bin = malloc(ct_bin_len);
    if (!ct_bin) { respond_err("malloc failed"); return; }
    for (size_t i = 0; i < ct_bin_len; i++) {


        int h = hv(ct_start[2*i]), l = hv(ct_start[2*i+1]);
        if (h < 0 || l < 0) { free(ct_bin); respond_err("invalid ct_hex"); return; }
        ct_bin[i] = (uint8_t)((h<<4)|l);
    }

    HABECiphertext ct;
    memset(&ct, 0, sizeof(ct));
    if (ct_deserialize(&g_params, ct_bin, ct_bin_len, &ct) != 0) {
        free(ct_bin); respond_err("ct_deserialize failed"); return;
    }
    free(ct_bin);

    /* usk_ids array */
    char usk_ids[HABE_MAX_ATTRS][HABE_MAX_ID_LEN * 3 + 2];
    int  usk_count_req = 0;
    {
        const char *p = strstr(json, "\"usk_ids\"");
        if (!p) { habe_ciphertext_free(&ct); respond_err("missing usk_ids"); return; }
        p += strlen("\"usk_ids\"");
        while (*p && *p != '[') p++;
        if (!*p) { habe_ciphertext_free(&ct); respond_err("usk_ids not array"); return; }
        p++;
        while (*p && *p != ']' && usk_count_req < HABE_MAX_ATTRS) {
            while (*p == ' ' || *p == ',') p++;
            if (*p == '"') {
                p++;
                size_t i = 0;
                size_t max = sizeof(usk_ids[usk_count_req]) - 1;
                while (*p && *p != '"' && i < max)
                    usk_ids[usk_count_req][i++] = *p++;
                usk_ids[usk_count_req][i] = '\0';
                if (*p == '"') p++;
                usk_count_req++;
            } else if (*p == ']') break;
            else p++;
        }
    }

    int clause_idx = 0;
    json_get_int(json, "clause_idx", &clause_idx);

    /* Resolve USK entries into a contiguous array for habe_decrypt */
    HABEUserSecretKey usk_arr[HABE_MAX_ATTRS];
    for (int i = 0; i < usk_count_req; i++) {
        USKEntry *e = usk_find(usk_ids[i]);
        if (!e) {
            habe_ciphertext_free(&ct);
            respond_err("usk_id not found"); return;
        }
        usk_arr[i] = e->usk;  /* shallow copy — elements share PBC state */
    }

    uint8_t plaintext[HABE_PLAINTEXT_LEN] = {0};
    if (habe_decrypt(&g_params, &ct,
                     usk_arr,
                     usk_count_req,
                     clause_idx, plaintext) != 0) {
        habe_ciphertext_free(&ct);
        respond_err("habe_decrypt failed"); return;
    }
    habe_ciphertext_free(&ct);

    char pt_hex[HABE_PLAINTEXT_LEN * 2 + 1];
    bytes_to_hex(plaintext, HABE_PLAINTEXT_LEN, pt_hex);
    printf("{\"ok\":true,\"plaintext_hex\":\"%s\"}\n", pt_hex);
    fflush(stdout);
}

/* -----------------------------------------------------------------------
 * Main loop — read one JSON line, dispatch, respond
 * ----------------------------------------------------------------------- */
int main(void)
{
    /* Line-buffered stdout so Node.js readline gets complete lines */
    setvbuf(stdout, NULL, _IOLBF, 0);
    setvbuf(stderr, NULL, _IOLBF, 0);

    char line[CT_BUF_MAX * 2 + 256];  /* large enough for ct_hex in decrypt */

    fprintf(stderr, "[habe_cli] ready\n");

    while (fgets(line, sizeof(line), stdin)) {
        /* Strip trailing newline */
        size_t len = strlen(line);
        while (len > 0 && (line[len-1] == '\n' || line[len-1] == '\r'))
            line[--len] = '\0';
        if (len == 0) continue;

        char cmd[64] = {0};
        if (!json_get_str(line, "cmd", cmd, sizeof(cmd))) {
            respond_err("missing cmd"); continue;
        }

        if      (strcmp(cmd, "setup")       == 0) cmd_setup();
        else if (strcmp(cmd, "create_dm")   == 0) cmd_create_dm(line);
        else if (strcmp(cmd, "create_user") == 0) cmd_create_user(line);
        else if (strcmp(cmd, "encrypt")     == 0) cmd_encrypt(line);
        else if (strcmp(cmd, "decrypt")     == 0) cmd_decrypt(line);
        else respond_err("unknown cmd");
    }

    return 0;
}