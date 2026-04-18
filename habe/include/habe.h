#ifndef HABE_H
#define HABE_H

#include <pbc/pbc.h>
#include <stdint.h>
#include <stddef.h>

/* -----------------------------------------------------------------------
 * HABE — Hierarchical Attribute-Based Encryption
 * Based on: Wang et al., "Hierarchical Attribute-Based Encryption and
 * Scalable User Revocation for Sharing Data in Cloud Servers",
 * Computers & Security 30 (2011) 320-331.
 *
 * IIoT hierarchy (from PPT):
 *   Root Master (RM)  = Company
 *   Domain Master (DM) = Plant A / Plant B
 *   Sub-Domain Master (SDM) = Area A1, A2, B1, B2
 *   IoT devices        = raw data producers (no SK)
 *
 * Access policy: DNF — disjunction of conjunctive clauses.
 * Each conjunctive clause: all attributes must belong to the same DM.
 * ----------------------------------------------------------------------- */

#define HABE_MAX_DEPTH      8    /* max hierarchy depth                    */
#define HABE_MAX_ATTRS      16   /* max attributes per conjunctive clause  */
#define HABE_MAX_CLAUSES    8    /* max conjunctive clauses in DNF policy  */
#define HABE_MAX_ID_LEN     256  /* max string length for IDs              */
#define HABE_PLAINTEXT_LEN  32   /* fixed plaintext block size (bytes)     */

/* -----------------------------------------------------------------------
 * System Parameters — output of Setup(K)
 * params is public; MK0 is kept secret at RM.
 * ----------------------------------------------------------------------- */
typedef struct {
    pairing_t   pairing;         /* bilinear map ê: G1 × G1 → G2          */
    element_t   P0;              /* random generator of G1                 */
    element_t   Q0;             /* Q0 = mk0 * P0  ∈ G1                    */
    /* H1, H2, HA are implemented as deterministic hash-to-group functions */
} HABEParams;

/* -----------------------------------------------------------------------
 * Root Master Key — MK0 = (mk0), secret scalar in Zq
 * ----------------------------------------------------------------------- */
typedef struct {
    element_t   mk0;             /* master scalar ∈ Zq                    */
} HABERootMasterKey;

/* -----------------------------------------------------------------------
 * Domain Master Key — MKi for depth i
 *
 * MKi = (mki, SKi, Q_tuple_i)
 *   mki      : master scalar for this DM
 *   SKi      : accumulated secret key element ∈ G1
 *              SK1 = mk0 * P1  (from RM)
 *              SKi+1 = SKi + mki * Pi+1
 *   Q_tuple  : (Q1, Q2, ..., Qi) where Qk = mkk * P0
 *   depth    : level in hierarchy (1 = first DM below RM)
 *   pk_str   : this DM's public key string (its ID-tuple as ASCII)
 * ----------------------------------------------------------------------- */
typedef struct {
    int         depth;                          /* 1-based level           */
    char        pk_str[HABE_MAX_ID_LEN];        /* this DM's PK string     */
    /*
     * ancestor_pks[k] = PK string of the DM at depth (k+1).
     * ancestor_pks[0] = depth-1 DM pk (= P1 input for V)
     * ancestor_pks[1] = depth-2 DM pk (= P2 input for chain)
     * ...
     * ancestor_pks[depth-2] = this DM's own parent pk
     * ancestor_pks[depth-1] = this DM's own pk_str
     * length = depth
     */
    char        ancestor_pks[HABE_MAX_DEPTH][HABE_MAX_ID_LEN];
    int         ancestor_pks_len;               /* == depth                */
    element_t   mki;                            /* scalar ∈ Zq             */
    element_t   SKi;                            /* G1 element              */
    element_t   Q_tuple[HABE_MAX_DEPTH];        /* Qk = mkk * P0, k=0..i  */
    int         Q_tuple_len;                    /* == depth + 1 (incl. Q0) */
} HABEDomainMasterKey;

/* -----------------------------------------------------------------------
 * User Secret Key pair — issued by CreateUser
 *   SKi_u      : identity secret key
 *   SKi_u_a    : attribute secret key for attribute a
 * ----------------------------------------------------------------------- */
typedef struct {
    int         initialized;                  /* set to 1 by CreateUser   */
    /* Identity secret key: SKi,u = (Q_tuple_{i-1}, mki*mku*P0) */
    element_t   Q_tuple[HABE_MAX_DEPTH];  /* Q-tuple from issuing DM       */
    int         Q_tuple_len;
    element_t   id_key;                   /* mki * mku * P0  ∈ G1         */

    /* Attribute secret key: SKi,u,a = SKi + mki*mku*Pa ∈ G1 */
    element_t   attr_key;                 /* one element per attribute     */

    char        attr_id[HABE_MAX_ID_LEN]; /* which attribute this is for  */
} HABEUserSecretKey;

/* -----------------------------------------------------------------------
 * DNF Access Policy
 *   A = CC1 ∨ CC2 ∨ ... ∨ CCN
 *   CCi = ai1 ∧ ai2 ∧ ... ∧ ai_ni
 *
 * All attributes in one CCi must be under the same DM.
 * attr_ids[i][j] = string ID of j-th attribute in i-th clause.
 * dm_pk[i]       = PK string of the DM administering CCi.
 * --- -------------------------------------------------------------------- */
typedef struct {
    int  N;                                          /* number of clauses   */
    int  n[HABE_MAX_CLAUSES];                        /* attrs per clause    */
    char attr_ids[HABE_MAX_CLAUSES][HABE_MAX_ATTRS][HABE_MAX_ID_LEN];
    char dm_pk[HABE_MAX_CLAUSES][HABE_MAX_ID_LEN];  /* DM PK per clause    */
    /* depth of DM administering each clause (for key derivation) */
    int  dm_depth[HABE_MAX_CLAUSES];
} HABEPolicy;

/* -----------------------------------------------------------------------
 * Ciphertext — output of Encrypt
 *
 * CT = (A, Cf) where Cf = [U0, U_ij..., U_i, V]
 *   U0 = r*P0
 *   For clause i at depth t: U_i2..U_it = r*Pij (ancestor DM elements)
 *   U_i = r * sum_{j=1}^{ni} Pa_ij   (sum of attribute generators)
 *   V   = f XOR H2(ê(Q0, r^nA * P1))
 *
 * For simplicity, we store per-clause: U0, U_i (summed attr term),
 * and the ancestor chain U_i2..U_it.
 * ----------------------------------------------------------------------- */
typedef struct {
    HABEPolicy  policy;

    /* U0 = r * P0, shared across all clauses */
    element_t   U0;

    /* Per clause i: ancestor chain elements U_i2 .. U_i_t */
    element_t   U_chain[HABE_MAX_CLAUSES][HABE_MAX_DEPTH]; /* r*Pij        */
    int         U_chain_len[HABE_MAX_CLAUSES];

    /* Per clause i: attribute sum element */
    element_t   U_attr[HABE_MAX_CLAUSES];   /* r * Σ Pa_ij                 */

    /* V = plaintext XOR H2(pairing_value), length HABE_PLAINTEXT_LEN */
    uint8_t     V[HABE_PLAINTEXT_LEN];

    int         nA;   /* LCM of n[0]..n[N-1], used in decryption          */
} HABECiphertext;

/* -----------------------------------------------------------------------
 * API
 * ----------------------------------------------------------------------- */

/**
 * Setup(K) → (params, MK0)
 * Initializes pairing from param_str (a PBC pairing parameter string,
 * e.g. Type A pairing). Caller is responsible for calling habe_params_free
 * and habe_rmk_free.
 */
int habe_setup(HABEParams *params, HABERootMasterKey *rmk,
               const char *pbc_param_str);

/**
 * CreateDM — generate MKi+1 for a child DM.
 * parent_mk : MKi (or NULL for depth-1 DM, uses rmk)
 * rmk        : root master key (used when parent is RM)
 * child_pk   : public key string of the new DM
 * child_mk   : output
 */
/*
 * NOTE: PBC's element_init_*, element_mul_zn, pairing_apply etc. do not
 * declare their pairing_t / element_t arguments const, even when they are
 * logically read-only. Propagating const through our API would produce
 * -Wdiscarded-qualifiers at every PBC call site. We therefore drop const
 * from any argument that touches a PBC type directly.
 */
int habe_create_dm(HABEParams          *params,
                   HABERootMasterKey   *rmk,       /* non-NULL if parent is RM */
                   HABEDomainMasterKey *parent_mk,  /* non-NULL if parent is DM */
                   const char          *child_pk,
                   HABEDomainMasterKey *child_mk);

int habe_create_user(HABEParams          *params,
                     HABEDomainMasterKey *dm_mk,
                     const char          *user_pk,
                     const char          *attr_pk,
                     HABEUserSecretKey   *usk);

int habe_encrypt(HABEParams          *params,
                 const uint8_t       *plaintext,
                 const HABEPolicy    *policy,
                 HABEDomainMasterKey *dm_mks[],   /* one per clause */
                 HABECiphertext      *ct);

int habe_decrypt(HABEParams        *params,
                 HABECiphertext    *ct,
                 HABEUserSecretKey *usk,
                 int                n_usk,
                 int                clause_idx,
                 uint8_t           *plaintext);

void habe_H1(HABEParams *params, const char *id, element_t out);
void habe_H2(HABEParams *params, element_t gt_elem, uint8_t *out, size_t out_len);
void habe_HA(HABEParams *params, const char *pk, element_t out_zq);

/* -----------------------------------------------------------------------
 * Memory management
 * ----------------------------------------------------------------------- */
void habe_params_free(HABEParams *params);
void habe_rmk_free(HABERootMasterKey *rmk);
void habe_dm_key_free(HABEDomainMasterKey *mk);
void habe_usk_free(HABEUserSecretKey *usk);
void habe_ciphertext_free(HABECiphertext *ct);

/** gcd / lcm helpers for nA computation */
int habe_gcd(int a, int b);
int habe_lcm(int a, int b);

#endif /* HABE_H */