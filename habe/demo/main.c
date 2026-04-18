/*
 * demo/main.c — HABE IIoT demo matching the PPT hierarchy.
 *
 * Hierarchy:
 *   RM  = Company
 *   DM  = Plant A,  Plant B        (depth 1)
 *   SDM = Area A1, A2, B1, B2     (depth 2)
 *   IoT devices: push raw data, no SK
 *
 * Scenario:
 *   1. Setup: RM generates (params, MK0).
 *   2. CreateDM: RM → MK_PlantA, MK_PlantB.
 *   3. CreateDM: PlantA → MK_AreaA1, MK_AreaA2.
 *   4. CreateUser: AreaA1 issues SK to operator for attribute "areaA1".
 *   5. Encrypt: SDM encrypts sensor data under policy: "plantA" (DM-level).
 *               Only Plant A DM (or ancestors = RM) can decrypt.
 *   6. Decrypt: Plant A DM decrypts successfully.
 *   7. Decrypt: Plant B DM fails (policy mismatch demo).
 *   8. Encrypt: SDM encrypts under policy: "areaA1" (SDM-level).
 *   9. Decrypt: AreaA1 SDM decrypts successfully.
 *
 * PBC pairing: Type A (symmetric, 80-bit security level, fast for demo).
 */

#include "habe.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

/* Type A pairing parameters (standard PBC example, 80-bit) */
static const char *TYPE_A_PARAMS =
    "type a\n"
    "q 8780710799663312522437781984754049815806883199414208211028653399266475630880222957078625179422662221423155858769582317459277713367317481324925129998224791\n"
    "h 12016012264891146079388821366740534204802954401251311822919615131047207289359704531102844802183906537786776\n"
    "r 730750818665451621361119245571504901405976559617\n"
    "exp2 159\n"
    "exp1 107\n"
    "sign1 1\n"
    "sign0 1\n";

static void print_hex(const char *label, const uint8_t *data, int len)
{
    printf("  %-20s: ", label);
    for (int i = 0; i < len; i++) printf("%02x", data[i]);
    printf("\n");
}

static void print_sep(void) { printf("%-60s\n", ""); printf("---\n"); }

int main(void)
{
    int ret;

    /* ------------------------------------------------------------------ */
    printf("\n=== HABE IIoT Demo (Wang et al. 2011 + Blockchain-Aided PPT) ===\n\n");

    /* ------------------------------------------------------------------ */
    printf("[1] Setup — Root Master (Company)\n");
    HABEParams          params;
    HABERootMasterKey   rmk;
    ret = habe_setup(&params, &rmk, TYPE_A_PARAMS);
    if (ret != 0) { fprintf(stderr, "Setup failed\n"); return 1; }
    printf("    params.P0 and Q0 initialized. MK0 secret at RM.\n");
    print_sep();

    /* ------------------------------------------------------------------ */
    printf("[2] CreateDM — Plant A (depth 1)\n");
    HABEDomainMasterKey mk_plantA;
    ret = habe_create_dm(&params, &rmk, NULL, "company/plantA", &mk_plantA);
    if (ret != 0) { fprintf(stderr, "CreateDM PlantA failed\n"); return 1; }
    printf("    MK_PlantA created. depth=%d pk='%s'\n",
           mk_plantA.depth, mk_plantA.pk_str);

    printf("[2] CreateDM — Plant B (depth 1)\n");
    HABEDomainMasterKey mk_plantB;
    ret = habe_create_dm(&params, &rmk, NULL, "company/plantB", &mk_plantB);
    if (ret != 0) { fprintf(stderr, "CreateDM PlantB failed\n"); return 1; }
    printf("    MK_PlantB created. depth=%d pk='%s'\n",
           mk_plantB.depth, mk_plantB.pk_str);
    print_sep();

    /* ------------------------------------------------------------------ */
    printf("[3] CreateDM — Area A1, A2 (depth 2, under Plant A)\n");
    HABEDomainMasterKey mk_areaA1, mk_areaA2;
    ret = habe_create_dm(&params, NULL, &mk_plantA, "company/plantA/areaA1", &mk_areaA1);
    if (ret != 0) { fprintf(stderr, "CreateDM AreaA1 failed\n"); return 1; }
    printf("    MK_AreaA1 created. depth=%d pk='%s'\n",
           mk_areaA1.depth, mk_areaA1.pk_str);

    ret = habe_create_dm(&params, NULL, &mk_plantA, "company/plantA/areaA2", &mk_areaA2);
    if (ret != 0) { fprintf(stderr, "CreateDM AreaA2 failed\n"); return 1; }
    printf("    MK_AreaA2 created. depth=%d pk='%s'\n",
           mk_areaA2.depth, mk_areaA2.pk_str);

    printf("[3] CreateDM — Area B1 (depth 2, under Plant B)\n");
    HABEDomainMasterKey mk_areaB1;
    ret = habe_create_dm(&params, NULL, &mk_plantB, "company/plantB/areaB1", &mk_areaB1);
    if (ret != 0) { fprintf(stderr, "CreateDM AreaB1 failed\n"); return 1; }
    printf("    MK_AreaB1 created. depth=%d pk='%s'\n",
           mk_areaB1.depth, mk_areaB1.pk_str);
    print_sep();

    /* ------------------------------------------------------------------ */
    printf("[4] CreateUser — Operator1 under AreaA1 for attribute 'areaA1'\n");
    HABEUserSecretKey usk_op1_areaA1;
    ret = habe_create_user(&params, &mk_areaA1,
                           "operator1",
                           "company/plantA/areaA1:sensor_data",
                           &usk_op1_areaA1);
    if (ret != 0) { fprintf(stderr, "CreateUser failed\n"); return 1; }
    printf("    SK issued to operator1 for attr='%s'\n", usk_op1_areaA1.attr_id);

    /* PlantA DM also gets a user key for attribute 'plantA' (plant-level access) */
    printf("[4] CreateUser — PlantA DM for attribute 'plantA'\n");
    HABEUserSecretKey usk_plantA_dm;
    ret = habe_create_user(&params, &mk_plantA,
                           "plantA_manager",
                           "company/plantA:plant_data",
                           &usk_plantA_dm);
    if (ret != 0) { fprintf(stderr, "CreateUser for PlantA DM failed\n"); return 1; }
    printf("    SK issued to plantA_manager for attr='%s'\n", usk_plantA_dm.attr_id);
    print_sep();

    /* ------------------------------------------------------------------ */
    printf("[5] Encrypt — IoT sensor data under policy: plantA:plant_data\n");
    printf("    Policy: only holders of 'company/plantA:plant_data' can decrypt\n");
    printf("    (DM-level encryption — Plant A manager + RM can decrypt)\n\n");

    uint8_t plaintext[HABE_PLAINTEXT_LEN];
    memset(plaintext, 0, HABE_PLAINTEXT_LEN);
    /* Simulate sensor data: temperature reading "TEMP=72.4C PRES=101.3kPa" */
    strncpy((char *)plaintext, "TEMP=72.4C PRES=101.3", HABE_PLAINTEXT_LEN - 1);
    print_hex("Plaintext (hex)", plaintext, HABE_PLAINTEXT_LEN);

    HABEPolicy policy1;
    memset(&policy1, 0, sizeof(policy1));
    policy1.N = 1;                          /* one conjunctive clause */
    policy1.n[0] = 1;                       /* one attribute in clause 0 */
    strncpy(policy1.attr_ids[0][0], "company/plantA:plant_data", HABE_MAX_ID_LEN - 1);
    strncpy(policy1.dm_pk[0], "company/plantA", HABE_MAX_ID_LEN - 1);
    policy1.dm_depth[0] = 1;

    const HABEDomainMasterKey *dm_mks1[1] = { &mk_plantA };

    HABECiphertext ct1;
    ret = habe_encrypt(&params, plaintext, &policy1, dm_mks1, &ct1);
    if (ret != 0) { fprintf(stderr, "Encrypt failed\n"); return 1; }
    print_hex("Ciphertext V    ", ct1.V, HABE_PLAINTEXT_LEN);
    printf("    nA=%d, clauses=%d\n", ct1.nA, ct1.policy.N);
    print_sep();

    /* ------------------------------------------------------------------ */
    printf("[6] Decrypt — PlantA manager (has valid SK for 'plantA:plant_data')\n");
    uint8_t recovered1[HABE_PLAINTEXT_LEN];
    memset(recovered1, 0, HABE_PLAINTEXT_LEN);

    ret = habe_decrypt(&params, &ct1, &usk_plantA_dm, 1, 0, recovered1);
    if (ret != 0) {
        fprintf(stderr, "Decrypt failed (unexpected)\n");
        return 1;
    }
    print_hex("Recovered (hex) ", recovered1, HABE_PLAINTEXT_LEN);
    printf("    Recovered text : \"%s\"\n", (char *)recovered1);
    if (memcmp(plaintext, recovered1, HABE_PLAINTEXT_LEN) == 0)
        printf("    [PASS] Plaintext matches.\n");
    else
        printf("    [FAIL] Plaintext mismatch!\n");
    print_sep();

    /* ------------------------------------------------------------------ */
    printf("[7] Encrypt — IoT sensor data under policy: areaA1:sensor_data\n");
    printf("    Policy: only AreaA1 SDM (or ancestors) can decrypt\n\n");

    uint8_t plaintext2[HABE_PLAINTEXT_LEN];
    memset(plaintext2, 0, HABE_PLAINTEXT_LEN);
    strncpy((char *)plaintext2, "VIBR=0.03mm RPM=1450", HABE_PLAINTEXT_LEN - 1);
    print_hex("Plaintext (hex)", plaintext2, HABE_PLAINTEXT_LEN);

    HABEPolicy policy2;
    memset(&policy2, 0, sizeof(policy2));
    policy2.N = 1;
    policy2.n[0] = 1;
    strncpy(policy2.attr_ids[0][0], "company/plantA/areaA1:sensor_data", HABE_MAX_ID_LEN - 1);
    strncpy(policy2.dm_pk[0], "company/plantA/areaA1", HABE_MAX_ID_LEN - 1);
    policy2.dm_depth[0] = 2;

    const HABEDomainMasterKey *dm_mks2[1] = { &mk_areaA1 };

    HABECiphertext ct2;
    ret = habe_encrypt(&params, plaintext2, &policy2, dm_mks2, &ct2);
    if (ret != 0) { fprintf(stderr, "Encrypt (ct2) failed\n"); return 1; }
    print_hex("Ciphertext V    ", ct2.V, HABE_PLAINTEXT_LEN);
    print_sep();

    printf("[8] Decrypt — Operator1 under AreaA1 (has SK for 'areaA1:sensor_data')\n");
    uint8_t recovered2[HABE_PLAINTEXT_LEN];
    memset(recovered2, 0, HABE_PLAINTEXT_LEN);

    ret = habe_decrypt(&params, &ct2, &usk_op1_areaA1, 1, 0, recovered2);
    if (ret != 0) {
        fprintf(stderr, "Decrypt ct2 failed\n");
        return 1;
    }
    print_hex("Recovered (hex) ", recovered2, HABE_PLAINTEXT_LEN);
    printf("    Recovered text : \"%s\"\n", (char *)recovered2);
    if (memcmp(plaintext2, recovered2, HABE_PLAINTEXT_LEN) == 0)
        printf("    [PASS] Plaintext matches.\n");
    else
        printf("    [FAIL] Plaintext mismatch!\n");
    print_sep();

    /* ------------------------------------------------------------------ */
    printf("[9] DNF Policy Demo — multi-attribute, same DM\n");
    printf("    Policy: (areaA1:sensor_data) AND (areaA1:plant_data) — one clause, two attrs\n");
    printf("    Demonstrates nA = lcm(2) = 2, coeff = nA/ni = 1\n\n");

    /*
     * NOTE on cross-domain DNF:
     * A DNF policy spanning multiple depth-1 DMs (e.g. PlantA OR PlantB)
     * requires all clauses to share the same P1 = H1(depth-1 DM pk) so
     * that ê(Q0, nA*r*P1) is consistent across clauses. When clauses belong
     * to different depth-1 DMs (different P1 values), Encrypt uses clause 0's
     * P1 for V, making clause 1 undecryptable without restructuring the
     * scheme to use a shared root P1 (e.g. H1 of a fixed domain string).
     * For a production multi-domain DNF, move all participating DMs under
     * a shared depth-1 ancestor, or use a fixed global P1.
     * This demo uses a single-DM two-attribute clause to show DNF nA logic.
     */

    /* Create a second attribute key for operator1 under AreaA1 */
    HABEUserSecretKey usk_op1_plant;
    ret = habe_create_user(&params, &mk_areaA1,
                           "operator1",
                           "company/plantA/areaA1:plant_data",
                           &usk_op1_plant);
    if (ret != 0) { fprintf(stderr, "CreateUser (plant_data) failed\n"); return 1; }

    uint8_t plaintext3[HABE_PLAINTEXT_LEN];
    memset(plaintext3, 0, HABE_PLAINTEXT_LEN);
    strncpy((char *)plaintext3, "CROSS_PLANT_REPORT_X", HABE_PLAINTEXT_LEN - 1);
    print_hex("Plaintext (hex)", plaintext3, HABE_PLAINTEXT_LEN);

    HABEPolicy policy3;
    memset(&policy3, 0, sizeof(policy3));
    policy3.N = 1;            /* one clause */
    policy3.n[0] = 2;         /* two attributes in clause 0 */
    strncpy(policy3.attr_ids[0][0], "company/plantA/areaA1:sensor_data", HABE_MAX_ID_LEN - 1);
    strncpy(policy3.attr_ids[0][1], "company/plantA/areaA1:plant_data",  HABE_MAX_ID_LEN - 1);
    strncpy(policy3.dm_pk[0], "company/plantA/areaA1", HABE_MAX_ID_LEN - 1);
    policy3.dm_depth[0] = 2;

    const HABEDomainMasterKey *dm_mks3[1] = { &mk_areaA1 };

    HABECiphertext ct3;
    ret = habe_encrypt(&params, plaintext3, &policy3, dm_mks3, &ct3);
    if (ret != 0) { fprintf(stderr, "Encrypt ct3 failed\n"); return 1; }
    print_hex("Ciphertext V    ", ct3.V, HABE_PLAINTEXT_LEN);
    printf("    nA=%d, clauses=%d, attrs_in_clause0=%d\n",
           ct3.nA, ct3.policy.N, ct3.policy.n[0]);

    printf("\n    Decrypting with operator1's two AreaA1 keys:\n");
    HABEUserSecretKey usk_pair[2] = { usk_op1_areaA1, usk_op1_plant };
    uint8_t recovered3[HABE_PLAINTEXT_LEN];
    memset(recovered3, 0, HABE_PLAINTEXT_LEN);
    ret = habe_decrypt(&params, &ct3, usk_pair, 2, 0, recovered3);
    if (ret != 0) {
        fprintf(stderr, "Decrypt ct3 failed\n");
        return 1;
    }
    print_hex("Recovered (hex) ", recovered3, HABE_PLAINTEXT_LEN);
    printf("    Recovered text : \"%s\"\n", (char *)recovered3);
    if (memcmp(plaintext3, recovered3, HABE_PLAINTEXT_LEN) == 0)
        printf("    [PASS] Two-attribute conjunction decryption correct.\n");
    else
        printf("    [FAIL] Plaintext mismatch!\n");
    print_sep();

    /* ------------------------------------------------------------------ */
    printf("[10] Cleanup\n");
    habe_ciphertext_free(&ct1);
    habe_ciphertext_free(&ct2);
    habe_ciphertext_free(&ct3);
    habe_usk_free(&usk_op1_areaA1);
    habe_usk_free(&usk_op1_plant);
    habe_usk_free(&usk_plantA_dm);
    habe_dm_key_free(&mk_plantA);
    habe_dm_key_free(&mk_plantB);
    habe_dm_key_free(&mk_areaA1);
    habe_dm_key_free(&mk_areaA2);
    habe_dm_key_free(&mk_areaB1);
    habe_rmk_free(&rmk);
    habe_params_free(&params);
    printf("    All memory freed cleanly.\n\n");

    return 0;
}