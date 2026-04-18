/*
 * habe.c — Core HABE scheme implementation.
 *
 * Construction follows Wang et al. (2011), Section 5.
 *
 * -------------------------------------------------------------------------
 * CORRECTNESS INVARIANT
 * -------------------------------------------------------------------------
 *
 * The scheme must produce ê(Q0, nA·r·P1) in both Encrypt and Decrypt.
 * P1 = H1(depth-1 DM pk).
 *
 * SKi accumulated in CreateDM at depth d:
 *   SK1 = mk0·P1
 *   SK2 = mk0·P1 + mk1·P2
 *   SKd = Σ_{k=0}^{d-1} mk_k · P_{k+1}
 *
 * SKi,u,a = SKi + mki·mku·Pa
 *
 * Σ_j SKi,u,aj  (ni attributes, same DM at depth d):
 *   = ni·SKi + mki·mku·Σ Pa_j
 *
 * ê(U0, coeff·Σ SKi,u,aj)  where coeff=nA/ni, U0=r·P0:
 *   = ê(r·P0, nA·SKi)  ·  ê(r·P0, nA/ni·mki·mku·Σ Pa_j)
 *
 * ê(r·P0, nA·SKi) expands via bilinearity to:
 *   ê(Q0, nA·r·P1)  ·  Π_{k=1}^{d-1} ê(r·P0, nA·mk_k·P_{k+1})
 *   where Q0 = mk0·P0
 *
 * Wanted: ê(Q0, nA·r·P1)
 *
 * Cancelled by term2:
 *   ê(id_key, coeff·U_attr) = ê(mki·mku·P0, nA/ni·r·Σ Pa_j)
 *   cancels ê(r·P0, nA/ni·mki·mku·Σ Pa_j) ✓
 *
 * Cancelled by chain (k=0..d-2):
 *   ê(U_chain[i][k], nA·Q_{k+1})
 *   = ê(r·P_{k+2}, nA·mk_{k+1}·P0)
 *   = ê(r·P0, nA·mk_{k+1}·P_{k+2})   [bilinearity]
 *   cancels Π_{k=1}^{d-1} ê(r·P0, nA·mk_k·P_{k+1}) ✓
 *
 * Where:
 *   U_chain[i][k] = r · H1(ancestor_pks[k+1])  (stored in CT)
 *   Q_{k+1}       = usk->Q_tuple[k+1]           (mk_{k+1}·P0)
 * -------------------------------------------------------------------------
 */

#include "habe.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

/* -----------------------------------------------------------------------
 * derive_Pa: Pa = H1(mki_str || ":" || attr_pk)
 * Must be called identically in CreateUser and Encrypt.
 * ----------------------------------------------------------------------- */
static void derive_Pa(HABEParams          *params,
                      HABEDomainMasterKey *dm_mk,
                      const char                *attr_pk,
                      element_t                  Pa)
{
    char mki_buf[512];
    element_snprintf(mki_buf, sizeof(mki_buf), "%B", dm_mk->mki);    char combined[HABE_MAX_ID_LEN + 512];
    snprintf(combined, sizeof(combined), "%s:%s", mki_buf, attr_pk);
    habe_H1(params, combined, Pa);
}

/* -----------------------------------------------------------------------
 * Setup(K) -> (params, MK0)
 * ----------------------------------------------------------------------- */
int habe_setup(HABEParams *params, HABERootMasterKey *rmk,
               const char *pbc_param_str)
{
    pbc_param_t par;
    if (pbc_param_init_set_str(par, pbc_param_str) != 0) {
        fprintf(stderr, "habe_setup: failed to parse PBC params\n");
        return -1;
    }
    pairing_init_pbc_param(params->pairing, par);
    pbc_param_clear(par);

    element_init_G1(params->P0, params->pairing);
    element_init_G1(params->Q0, params->pairing);
    element_random(params->P0);

    element_init_Zr(rmk->mk0, params->pairing);
    element_random(rmk->mk0);

    element_mul_zn(params->Q0, params->P0, rmk->mk0);
    return 0;
}

/* -----------------------------------------------------------------------
 * CreateDM
 *
 * child_mk->ancestor_pks[k] = pk of DM at depth k+1
 *   depth-1 DM: ancestor_pks = [child_pk],       len=1
 *   depth-2 DM: ancestor_pks = [parent_pk, child_pk], len=2
 *
 * child_mk->Q_tuple[k] = mk_k * P0  for k=0..depth
 *   Q_tuple[0] = Q0 = mk0*P0 (copy of params->Q0)
 *   Q_tuple[k] = mk_k * P0
 *   Q_tuple_len = depth + 1
 *
 * child_mk->SKi = Σ_{k=0}^{depth-1} mk_k * P_{k+1}
 * ----------------------------------------------------------------------- */
int habe_create_dm(HABEParams          *params,
                   HABERootMasterKey   *rmk,
                   HABEDomainMasterKey *parent_mk,
                   const char                *child_pk,
                   HABEDomainMasterKey       *child_mk)
{
    if (!rmk && !parent_mk) {
        fprintf(stderr, "habe_create_dm: need at least one parent\n");
        return -1;
    }

    memset(child_mk, 0, sizeof(*child_mk));
    strncpy(child_mk->pk_str, child_pk, HABE_MAX_ID_LEN - 1);
    child_mk->depth = (rmk && !parent_mk) ? 1 : parent_mk->depth + 1;

    if (child_mk->depth > HABE_MAX_DEPTH) {
        fprintf(stderr, "habe_create_dm: depth exceeds HABE_MAX_DEPTH\n");
        return -1;
    }

    element_init_Zr(child_mk->mki, params->pairing);
    element_random(child_mk->mki);
    element_init_G1(child_mk->SKi, params->pairing);

    /* Pd = H1(child_pk) — the group element for this DM's level */
    element_t Pd;
    element_init_G1(Pd, params->pairing);
    habe_H1(params, child_pk, Pd);

    if (child_mk->depth == 1) {
        /* SK1 = mk0 * P1 */
        element_mul_zn(child_mk->SKi, Pd, rmk->mk0);

        /* Q_tuple = [Q0, Q1] */
        element_init_G1(child_mk->Q_tuple[0], params->pairing);
        element_set(child_mk->Q_tuple[0], params->Q0);

        element_init_G1(child_mk->Q_tuple[1], params->pairing);
        element_mul_zn(child_mk->Q_tuple[1], params->P0, child_mk->mki);
        child_mk->Q_tuple_len = 2;

        /* ancestor_pks = [child_pk] */
        strncpy(child_mk->ancestor_pks[0], child_pk, HABE_MAX_ID_LEN - 1);
        child_mk->ancestor_pks_len = 1;

    } else {
        /* SKd = SK_{d-1} + mk_{d-1} * Pd */
        element_t tmp;
        element_init_G1(tmp, params->pairing);
        element_mul_zn(tmp, Pd, parent_mk->mki);
        element_add(child_mk->SKi, parent_mk->SKi, tmp);
        element_clear(tmp);

        /* Q_tuple = parent Q_tuple + [Qd] */
        if (parent_mk->Q_tuple_len >= HABE_MAX_DEPTH) {
            fprintf(stderr, "habe_create_dm: Q_tuple overflow\n");
            element_clear(Pd);
            return -1;
        }
        for (int k = 0; k < parent_mk->Q_tuple_len; k++) {
            element_init_G1(child_mk->Q_tuple[k], params->pairing);
            element_set(child_mk->Q_tuple[k], parent_mk->Q_tuple[k]);
        }
        int qi = parent_mk->Q_tuple_len;
        element_init_G1(child_mk->Q_tuple[qi], params->pairing);
        element_mul_zn(child_mk->Q_tuple[qi], params->P0, child_mk->mki);
        child_mk->Q_tuple_len = qi + 1;

        /* ancestor_pks = parent ancestor_pks + [child_pk] */
        if (parent_mk->ancestor_pks_len >= HABE_MAX_DEPTH) {
            fprintf(stderr, "habe_create_dm: ancestor_pks overflow\n");
            element_clear(Pd);
            return -1;
        }
        for (int k = 0; k < parent_mk->ancestor_pks_len; k++)
            strncpy(child_mk->ancestor_pks[k], parent_mk->ancestor_pks[k],
                    HABE_MAX_ID_LEN - 1);
        strncpy(child_mk->ancestor_pks[parent_mk->ancestor_pks_len],
                child_pk, HABE_MAX_ID_LEN - 1);
        child_mk->ancestor_pks_len = parent_mk->ancestor_pks_len + 1;
    }

    element_clear(Pd);
    return 0;
}

/* -----------------------------------------------------------------------
 * CreateUser
 *
 * mku       = HA(user_pk)
 * id_key    = mki * mku * P0
 * attr_key  = SKi + mki * mku * Pa
 * Q_tuple   = dm_mk->Q_tuple[0..depth-1]   (excludes Qd at index depth)
 *             Q_tuple_len = depth
 * ----------------------------------------------------------------------- */
int habe_create_user(HABEParams          *params,
                     HABEDomainMasterKey *dm_mk,
                     const char                *user_pk,
                     const char                *attr_pk,
                     HABEUserSecretKey         *usk)
{
    memset(usk, 0, sizeof(*usk));
    strncpy(usk->attr_id, attr_pk, HABE_MAX_ID_LEN - 1);

    element_t mku;
    element_init_Zr(mku, params->pairing);
    habe_HA(params, user_pk, mku);

    element_t mki_mku;
    element_init_Zr(mki_mku, params->pairing);
    element_mul(mki_mku, dm_mk->mki, mku);

    /*
     * Q_tuple in usk: copy Q_tuple[0..depth-1] from dm_mk
     * dm_mk->Q_tuple has depth+1 entries: Q0..Qd
     * We exclude Qd (last entry), copying Q0..Q_{d-1}
     * Q_tuple_len = depth = dm_mk->Q_tuple_len - 1
     */
    int qtlen = dm_mk->Q_tuple_len - 1;
    if (qtlen < 0) qtlen = 0;
    for (int k = 0; k < qtlen; k++) {
        element_init_G1(usk->Q_tuple[k], params->pairing);
        element_set(usk->Q_tuple[k], dm_mk->Q_tuple[k]);
    }
    usk->Q_tuple_len = qtlen;

    element_init_G1(usk->id_key, params->pairing);
    element_mul_zn(usk->id_key, params->P0, mki_mku);

    element_t Pa;
    element_init_G1(Pa, params->pairing);
    derive_Pa(params, dm_mk, attr_pk, Pa);

    element_t mki_mku_Pa;
    element_init_G1(mki_mku_Pa, params->pairing);
    element_mul_zn(mki_mku_Pa, Pa, mki_mku);

    element_init_G1(usk->attr_key, params->pairing);
    element_add(usk->attr_key, dm_mk->SKi, mki_mku_Pa);

    element_clear(mku);
    element_clear(mki_mku);
    element_clear(Pa);
    element_clear(mki_mku_Pa);
    usk->initialized = 1;
    return 0;
}

/* -----------------------------------------------------------------------
 * Encrypt
 *
 * For each clause i, DM at depth d:
 *   U0             = r * P0
 *   U_chain[i][k]  = r * H1(ancestor_pks[k+1])   k=0..d-2
 *   U_attr[i]      = r * Σ Pa_j
 *
 * V = plaintext XOR H2(ê(Q0, nA*r*P1))
 *   P1 = H1(dm_mks[0]->ancestor_pks[0])
 * ----------------------------------------------------------------------- */
int habe_encrypt(HABEParams          *params,
                 const uint8_t             *plaintext,
                 const HABEPolicy          *policy,
                 HABEDomainMasterKey *dm_mks[],
                 HABECiphertext            *ct)
{
    memcpy(&ct->policy, policy, sizeof(HABEPolicy));

    ct->nA = policy->n[0];
    for (int i = 1; i < policy->N; i++)
        ct->nA = habe_lcm(ct->nA, policy->n[i]);

    element_t r;
    element_init_Zr(r, params->pairing);
    element_random(r);

    element_init_G1(ct->U0, params->pairing);
    element_mul_zn(ct->U0, params->P0, r);

    for (int i = 0; i < policy->N; i++) {
        HABEDomainMasterKey *dm = dm_mks[i];
        int d = dm->depth;

        /*
         * Chain elements: U_chain[i][k] = r * P_{k+2}
         *   P_{k+2} = H1(ancestor_pks[k+1])   for k=0..d-2
         *
         * ancestor_pks layout:
         *   [0] = depth-1 DM pk  → P1 (used for V, NOT in chain)
         *   [1] = depth-2 DM pk  → P2 (chain[0])
         *   ...
         *   [d-1] = this DM pk   → Pd (chain[d-2])
         *
         * chain_len = d - 1
         */
        ct->U_chain_len[i] = d - 1;
        for (int k = 0; k < d - 1; k++) {
            element_t Pkp2;
            element_init_G1(Pkp2, params->pairing);
            habe_H1(params, dm->ancestor_pks[k + 1], Pkp2);
            element_init_G1(ct->U_chain[i][k], params->pairing);
            element_mul_zn(ct->U_chain[i][k], Pkp2, r);
            element_clear(Pkp2);
        }

        /* U_attr[i] = r * Σ Pa_j */
        element_t sum;
        element_init_G1(sum, params->pairing);
        element_set0(sum);
        for (int j = 0; j < policy->n[i]; j++) {
            element_t Pa;
            element_init_G1(Pa, params->pairing);
            derive_Pa(params, dm, policy->attr_ids[i][j], Pa);
            element_add(sum, sum, Pa);
            element_clear(Pa);
        }
        element_init_G1(ct->U_attr[i], params->pairing);
        element_mul_zn(ct->U_attr[i], sum, r);
        element_clear(sum);
    }

    /* V = plaintext XOR H2(ê(Q0, nA*r*P1)) */
    element_t P1;
    element_init_G1(P1, params->pairing);
    habe_H1(params, dm_mks[0]->ancestor_pks[0], P1);

    element_t nA_r;
    element_init_Zr(nA_r, params->pairing);
    element_set_si(nA_r, ct->nA);
    element_mul(nA_r, nA_r, r);

    element_t nA_r_P1;
    element_init_G1(nA_r_P1, params->pairing);
    element_mul_zn(nA_r_P1, P1, nA_r);

    element_t pv;
    element_init_GT(pv, params->pairing);
    pairing_apply(pv, params->Q0, nA_r_P1, params->pairing);

    uint8_t mask[HABE_PLAINTEXT_LEN];
    habe_H2(params, pv, mask, HABE_PLAINTEXT_LEN);
    for (int k = 0; k < HABE_PLAINTEXT_LEN; k++)
        ct->V[k] = plaintext[k] ^ mask[k];

    element_clear(r);
    element_clear(P1);
    element_clear(nA_r);
    element_clear(nA_r_P1);
    element_clear(pv);
    return 0;
}

/* -----------------------------------------------------------------------
 * Decrypt
 *
 * term1 = ê(U0, coeff * Σ SKi,u,aj)
 * term2 = ê(id_key, coeff * U_attr[ci])          — cancels attr contribution
 * chain = Π ê(U_chain[ci][k], nA * Q_{k+1})      — cancels DM chain
 *
 * result = term1 / term2 / chain = ê(Q0, nA*r*P1)
 *
 * Q_tuple indexing in usk (Q_tuple_len = depth = d):
 *   Q_tuple[0] = Q0 = mk0*P0
 *   Q_tuple[1] = Q1 = mk1*P0
 *   ...
 *   Q_tuple[d-1] = Q_{d-1} = mk_{d-1}*P0
 *
 * Chain uses Q_tuple[k+1] for k=0..chain_len-1 (i.e. Q1..Q_{d-1}).
 * ----------------------------------------------------------------------- */
int habe_decrypt(HABEParams        *params,
                 HABECiphertext    *ct,
                 HABEUserSecretKey *usk,
                 int                      n_usk,
                 int                      clause_idx,
                 uint8_t                 *plaintext)
{
    int ci = clause_idx;
    if (ci < 0 || ci >= ct->policy.N) {
        fprintf(stderr, "habe_decrypt: invalid clause_idx %d\n", ci);
        return -1;
    }
    int ni = ct->policy.n[ci];
    if (n_usk < ni) {
        fprintf(stderr, "habe_decrypt: need %d keys, got %d\n", ni, n_usk);
        return -1;
    }

    int coeff = ct->nA / ni;
    element_t coeff_elem;
    element_init_Zr(coeff_elem, params->pairing);
    element_set_si(coeff_elem, coeff);

    /* Σ attr_keys */
    element_t sk_sum;
    element_init_G1(sk_sum, params->pairing);
    element_set0(sk_sum);
    for (int j = 0; j < ni; j++)
        element_add(sk_sum, sk_sum, usk[j].attr_key);

    element_t coeff_sk_sum;
    element_init_G1(coeff_sk_sum, params->pairing);
    element_mul_zn(coeff_sk_sum, sk_sum, coeff_elem);

    element_t term1;
    element_init_GT(term1, params->pairing);
    pairing_apply(term1, ct->U0, coeff_sk_sum, params->pairing);

    element_t coeff_Uattr;
    element_init_G1(coeff_Uattr, params->pairing);
    element_mul_zn(coeff_Uattr, ct->U_attr[ci], coeff_elem);

    element_t term2;
    element_init_GT(term2, params->pairing);
    pairing_apply(term2, usk[0].id_key, coeff_Uattr, params->pairing);

    element_t result;
    element_init_GT(result, params->pairing);
    element_div(result, term1, term2);

    /* Chain cancellation */
    element_t nA_elem;
    element_init_Zr(nA_elem, params->pairing);
    element_set_si(nA_elem, ct->nA);

    int chain_len = ct->U_chain_len[ci];
    for (int k = 0; k < chain_len; k++) {
        int q_idx = k + 1;   /* Q_{k+1} in usk->Q_tuple */
        if (q_idx >= usk[0].Q_tuple_len) {
            fprintf(stderr, "habe_decrypt: Q_tuple too short (chain k=%d, q_idx=%d, len=%d)\n",
                    k, q_idx, usk[0].Q_tuple_len);
            element_clear(coeff_elem); element_clear(sk_sum);
            element_clear(coeff_sk_sum); element_clear(term1);
            element_clear(coeff_Uattr); element_clear(term2);
            element_clear(result); element_clear(nA_elem);
            return -1;
        }

        element_t nA_Q;
        element_init_G1(nA_Q, params->pairing);
        element_mul_zn(nA_Q, usk[0].Q_tuple[q_idx], nA_elem);

        element_t cp;
        element_init_GT(cp, params->pairing);
        pairing_apply(cp, ct->U_chain[ci][k], nA_Q, params->pairing);
        element_div(result, result, cp);

        element_clear(nA_Q);
        element_clear(cp);
    }

    uint8_t mask[HABE_PLAINTEXT_LEN];
    habe_H2(params, result, mask, HABE_PLAINTEXT_LEN);
    for (int k = 0; k < HABE_PLAINTEXT_LEN; k++)
        plaintext[k] = ct->V[k] ^ mask[k];

    element_clear(coeff_elem);
    element_clear(sk_sum);
    element_clear(coeff_sk_sum);
    element_clear(term1);
    element_clear(coeff_Uattr);
    element_clear(term2);
    element_clear(result);
    element_clear(nA_elem);
    return 0;
}

/* -----------------------------------------------------------------------
 * Memory management
 * ----------------------------------------------------------------------- */

void habe_params_free(HABEParams *params)
{
    element_clear(params->P0);
    element_clear(params->Q0);
    pairing_clear(params->pairing);
}

void habe_rmk_free(HABERootMasterKey *rmk)
{
    element_clear(rmk->mk0);
}

void habe_dm_key_free(HABEDomainMasterKey *mk)
{
    element_clear(mk->mki);
    element_clear(mk->SKi);
    for (int k = 0; k < mk->Q_tuple_len; k++)
        element_clear(mk->Q_tuple[k]);
    mk->Q_tuple_len = 0;
}

void habe_usk_free(HABEUserSecretKey *usk)
{
    if (!usk->initialized) return;
    for (int k = 0; k < usk->Q_tuple_len; k++)
        element_clear(usk->Q_tuple[k]);
    usk->Q_tuple_len = 0;
    element_clear(usk->id_key);
    element_clear(usk->attr_key);
    usk->initialized = 0;
}

void habe_ciphertext_free(HABECiphertext *ct)
{
    element_clear(ct->U0);
    for (int i = 0; i < ct->policy.N; i++) {
        for (int k = 0; k < ct->U_chain_len[i]; k++)
            element_clear(ct->U_chain[i][k]);
        element_clear(ct->U_attr[i]);
    }
}

int habe_gcd(int a, int b) { while (b) { int t = b; b = a % b; a = t; } return a; }
int habe_lcm(int a, int b) { return (a / habe_gcd(a, b)) * b; }