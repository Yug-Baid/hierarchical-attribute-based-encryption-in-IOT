/*
 * utils.c — Hash oracle implementations for HABE.
 *
 * H1: string → G1  via SHA-256 → hash-to-group (cofactor multiply)
 * H2: G2    → {0,1}^n via SHA-256 of element bytes
 * HA: string → Zq  via SHA-256 → mod q
 *
 * Note: These are ROM (random oracle model) instantiations.
 * PBC's element_from_hash() implements a standard hash-to-group map.
 */

#include "habe.h"
#include <openssl/sha.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

/* -----------------------------------------------------------------------
 * H1: {0,1}* → G1
 * Implements: hash the ID string with SHA-256, then map bytes to G1.
 * PBC element_from_hash() uses the bytes as a seed for a deterministic
 * group element (internally cofactor-multiply after hash-to-curve).
 * ----------------------------------------------------------------------- */
void habe_H1(HABEParams *params, const char *id, element_t out)
{
    (void)params;
    uint8_t digest[SHA256_DIGEST_LENGTH];
    SHA256((const uint8_t *)id, strlen(id), digest);
    element_from_hash(out, digest, SHA256_DIGEST_LENGTH);
}

void habe_H2(HABEParams *params, element_t gt_elem,
             uint8_t *out, size_t out_len)
{
    (void)params;
    /* Serialize GT element */
    int elem_len = element_length_in_bytes(gt_elem);
    uint8_t *buf = malloc(elem_len);
    if (!buf) { memset(out, 0, out_len); return; }
    element_to_bytes(buf, gt_elem);

    /* For output_len <= 32: single SHA-256 pass */
    if (out_len <= SHA256_DIGEST_LENGTH) {
        uint8_t digest[SHA256_DIGEST_LENGTH];
        SHA256(buf, elem_len, digest);
        memcpy(out, digest, out_len);
    } else {
        /* Counter mode for longer outputs (not needed here) */
        size_t pos = 0;
        uint32_t ctr = 0;
        uint8_t *tmp = malloc(elem_len + 4);
        if (!tmp) { free(buf); memset(out, 0, out_len); return; }
        while (pos < out_len) {
            memcpy(tmp, buf, elem_len);
            tmp[elem_len]   = (ctr >> 24) & 0xff;
            tmp[elem_len+1] = (ctr >> 16) & 0xff;
            tmp[elem_len+2] = (ctr >>  8) & 0xff;
            tmp[elem_len+3] =  ctr        & 0xff;
            uint8_t digest[SHA256_DIGEST_LENGTH];
            SHA256(tmp, elem_len + 4, digest);
            size_t copy = (out_len - pos < SHA256_DIGEST_LENGTH)
                          ? (out_len - pos) : SHA256_DIGEST_LENGTH;
            memcpy(out + pos, digest, copy);
            pos += copy;
            ctr++;
        }
        free(tmp);
    }
    free(buf);
}

/* -----------------------------------------------------------------------
 * HA: {0,1}* → Zq
 * Hash the PK string to a scalar in Zq using SHA-256 + element_from_hash
 * on a Zr element (PBC's ring of scalars).
 * ----------------------------------------------------------------------- */
void habe_HA(HABEParams *params, const char *pk, element_t out_zq)
{
    (void)params;
    uint8_t digest[SHA256_DIGEST_LENGTH];
    SHA256((const uint8_t *)pk, strlen(pk), digest);
    /* element_from_hash on a Zr element reduces the hash bytes mod q */
    element_from_hash(out_zq, digest, SHA256_DIGEST_LENGTH);
}