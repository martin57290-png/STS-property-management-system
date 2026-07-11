/**
 * Default California residential lease template.
 *
 * Uses ONLY merge fields listed in LEASE_MERGE_FIELDS (src/lib/merge.ts).
 * The seed script imports DEFAULT_CA_LEASE_TEMPLATE — keep the export name.
 */
export const DEFAULT_CA_LEASE_TEMPLATE: { name: string; body: string } = {
  name: 'California Residential Lease Agreement (Standard)',
  body: `RESIDENTIAL LEASE AGREEMENT (CALIFORNIA)

This Residential Lease Agreement ("Agreement") is made and entered into as of {{generated_date}}, by and between {{landlord_name}} ("Landlord") and {{tenant_names}} (each individually and all collectively, "Tenant"). Landlord and Tenant agree as follows:

1. PARTIES; JOINT AND SEVERAL LIABILITY
Landlord leases to Tenant, and Tenant leases from Landlord, the Premises described below on the terms of this Agreement. If more than one person signs this Agreement as Tenant, each is jointly and severally liable for the payment of rent and the performance of every other obligation of Tenant under this Agreement.

2. PREMISES
The premises leased are the residential dwelling located at {{property_address}}, Unit {{unit_number}}, {{city}}, {{state}} {{zip}} (the "Premises"), together with any furnishings, fixtures, and appliances presently located in the Premises. The Premises are to be used solely as a private residence for the Tenant(s) named in this Agreement and for no other purpose without Landlord's prior written consent.

3. TERM
The term of this Agreement is a fixed term beginning on {{lease_start_date}} and ending on {{lease_end_date}}, at which time this lease shall terminate without further notice unless renewed or extended in a writing signed by both parties. If Tenant remains in possession with Landlord's consent after the fixed term expires, the tenancy shall become a month-to-month tenancy on the same terms (California Civil Code Section 1945), terminable as provided by Civil Code Sections 1946 and 1946.1 and subject to any applicable just-cause limitations of Civil Code Section 1946.2.

4. RENT
Tenant shall pay Landlord monthly rent of {{monthly_rent}}, payable in advance and due on day {{rent_due_day}} of each calendar month, without deduction or offset except as permitted by law. Rent for any partial month at the beginning or end of the term shall be prorated on a 30-day basis. Rent is payable to {{landlord_name}} by check, money order, electronic payment through the resident portal, or any other method Landlord reasonably designates in writing. Landlord shall not require payment exclusively in cash except as permitted by Civil Code Section 1947.3.

5. SECURITY DEPOSIT
On or before move-in, Tenant shall deposit with Landlord the sum of {{security_deposit}} as a security deposit, to be held and applied as provided by California Civil Code Section 1950.5. In accordance with Section 1950.5 as amended by AB 12 (effective July 1, 2024), the security deposit does not exceed an amount equal to one month's rent. The deposit is not an advance payment of rent and may not be applied by Tenant to the last month's rent. Within 21 calendar days after Tenant vacates, Landlord shall furnish Tenant an itemized statement of the basis for, and the amount of, any portion of the deposit retained, together with a refund of any remaining balance, and copies of supporting receipts as required by Section 1950.5(g). Tenant has the right to request an initial move-out inspection and to be present at that inspection as provided by Civil Code Section 1950.5(f).

6. LATE CHARGE; RETURNED PAYMENTS
Tenant acknowledges that late payment of rent will cause Landlord to incur costs and inconvenience, the exact amount of which is extremely difficult and impracticable to ascertain. If any installment of rent is not received by Landlord within {{late_fee_grace_days}} days after it is due, Tenant shall pay a late charge of {{late_fee}} as liquidated damages. The parties agree this late charge represents a fair and reasonable estimate of the costs Landlord will incur by reason of late payment (Civil Code Section 1671) and is not a penalty. Acceptance of a late charge does not waive Tenant's default or Landlord's other remedies. If any check or electronic payment is dishonored or returned, Tenant shall pay a returned-payment charge as permitted by Civil Code Section 1719 ($25 for the first returned payment and $35 for each subsequent returned payment), plus any applicable late charge.

7. UTILITIES
The following utilities and services are included in the rent and shall be paid by Landlord: {{utilities_included}}. Tenant shall arrange and pay for all other utilities and services supplied to the Premises, including any deposits and connection fees, and shall keep such accounts current throughout the tenancy.

8. OCCUPANTS AND GUESTS
The Premises shall be occupied only by the Tenant(s) named in this Agreement and their minor children. Guests may not remain on the Premises for more than 14 consecutive days, or more than 30 days in any 12-month period, without Landlord's prior written consent. Any person occupying the Premises beyond these limits without consent shall constitute a material breach of this Agreement.

9. PETS
{{pet_terms}} If pets are authorized, Tenant shall pay additional pet rent of {{pet_rent}} per month for the authorized pet(s), keep all pets under control and in compliance with applicable law, and be responsible for any damage or injury caused by them. Nothing in this section applies to service animals or emotional support animals that Landlord is required to reasonably accommodate under fair housing laws; no pet rent, pet deposit, or other pet charge shall apply to such animals.

10. CONDITION OF PREMISES; MAINTENANCE AND REPAIRS
Tenant has examined the Premises and, except as otherwise noted on the move-in inspection checklist, accepts them as being in clean, safe, and habitable condition. Landlord shall maintain the Premises in compliance with the habitability standards of Civil Code Section 1941.1 and applicable housing codes. Tenant shall (a) keep the Premises clean and sanitary and dispose of all garbage properly, (b) properly use all fixtures and keep them clean, (c) not permit any person on the Premises to willfully or wantonly destroy, deface, damage, impair, or remove any part of the Premises (Civil Code Section 1941.2), (d) promptly notify Landlord in writing of any condition in need of repair, and (e) pay for repair of any damage caused by the negligence or misuse of Tenant, Tenant's household, or guests. Tenant shall not withhold rent or repair and deduct except strictly as permitted by Civil Code Sections 1942 and 1942.5.

11. ALTERATIONS
Tenant shall not paint, wallpaper, alter, re-key, or install any locks, antennas, fixtures, or equipment in or about the Premises without Landlord's prior written consent, except as expressly permitted by law.

12. RIGHT OF ENTRY
Landlord and Landlord's agents may enter the Premises only as permitted by Civil Code Section 1954: in an emergency; to make necessary or agreed repairs, decorations, alterations, or improvements, or to supply necessary or agreed services; to exhibit the Premises to prospective purchasers, mortgagees, tenants, workers, or contractors; pursuant to court order; when the Premises have been abandoned or surrendered; or for an agreed initial move-out inspection. Except in an emergency or where Tenant consents at the time of entry, Landlord shall give Tenant reasonable advance written notice of entry (24 hours is presumed reasonable) and shall enter only during normal business hours unless Tenant consents otherwise.

13. QUIET ENJOYMENT; CONDUCT
Landlord covenants that Tenant, upon paying rent and performing Tenant's obligations, shall peaceably and quietly hold and enjoy the Premises. Tenant shall not disturb the peace and quiet of neighbors or other residents, use the Premises for any unlawful purpose, or create or permit any nuisance or waste.

14. SMOKE ALARMS AND CARBON MONOXIDE DEVICES
The Premises are equipped with smoke alarms and carbon monoxide devices as required by law. Tenant shall not remove, disable, or tamper with these devices, shall replace batteries as needed where applicable, and shall promptly notify Landlord in writing of any malfunction.

15. SMOKING
Smoking of any substance, including the use of electronic cigarettes and vaping devices, is prohibited everywhere on the Premises and in all common areas of the property. Any damage, deodorizing, or repainting required because of smoking shall be at Tenant's expense.

16. BED BUG DISCLOSURE (CIVIL CODE SECTION 1954.603)
Landlord has provided Tenant with the bed bug information required by Civil Code Section 1954.603, including general information about bed bug identification, behavior and biology, the importance of cooperation for prevention and treatment, and the importance of promptly reporting suspected infestations. Tenant shall promptly notify Landlord in writing of any suspected bed bug infestation and shall cooperate with inspection and treatment efforts. Landlord shall not retaliate against Tenant for reporting a suspected infestation. Landlord represents that the Premises are not known to have a current bed bug infestation.

17. MOLD DISCLOSURE (HEALTH AND SAFETY CODE SECTION 26147)
Landlord has provided Tenant with the California Department of Public Health consumer booklet "Information on Dampness and Mold for Renters in California," as required by Health and Safety Code Section 26147. Landlord has no knowledge of any visible mold in the Premises that exceeds permissible exposure limits or poses a health threat, except as otherwise disclosed in writing. Tenant shall use reasonable ventilation, promptly clean any visible moisture or mildew, and promptly notify Landlord in writing of any water intrusion, leaks, dampness, or suspected mold.

18. MEGAN'S LAW NOTICE (PENAL CODE SECTION 290.46)
Notice: Pursuant to Section 290.46 of the Penal Code, information about specified registered sex offenders is made available to the public via an Internet Web site maintained by the Department of Justice at www.meganslaw.ca.gov. Depending on an offender's criminal history, this information will include either the address at which the offender resides or the community of residence and ZIP Code in which he or she resides.

19. LEAD-BASED PAINT DISCLOSURE (PRE-1978 HOUSING)
If the dwelling was built before January 1, 1978, federal law requires that Landlord disclose known information on lead-based paint and lead-based paint hazards before leasing, and that Tenant receive the federally approved pamphlet "Protect Your Family From Lead in Your Home." Where applicable, a completed Lead-Based Paint Disclosure form is attached to and made part of this Agreement.

20. FLOOD HAZARD DISCLOSURE
If the Premises are located in a special flood hazard area or an area of potential flooding, Landlord has disclosed that fact to Tenant as required by Government Code Section 8589.45. Landlord's insurance does not cover Tenant's personal property, and Tenant is advised that information about hazards, including flood hazards, in the area may be obtained from the Office of Emergency Services internet website at myhazards.caloes.ca.gov.

21. RENTER'S INSURANCE
Landlord's insurance does not protect Tenant against loss or damage to Tenant's personal property or against liability for injury or damage caused by Tenant. Tenant is strongly encouraged to obtain and maintain a renter's insurance policy covering personal property and personal liability for the duration of the tenancy.

22. ASSIGNMENT AND SUBLETTING
Tenant shall not assign this Agreement, sublet all or any part of the Premises, or license the Premises or any part thereof (including short-term or vacation rental of any duration), without Landlord's prior written consent. Any assignment or subletting without consent is void and constitutes a material breach of this Agreement.

23. DEFAULT; REMEDIES
Any failure by Tenant to pay rent when due, or to perform any other material obligation of this Agreement, shall constitute a default. In the event of default, Landlord may serve the notices and pursue the remedies provided by California law, including recovery of possession, unpaid rent, and damages. Landlord's rights and remedies are cumulative, and no delay or failure to enforce any provision shall waive Landlord's right to later enforce it.

24. NOTICES
Any notice required or permitted under this Agreement or by law shall be in writing and served as required by law. Notices to Tenant may be served at the Premises. Notices to Landlord shall be served on {{landlord_name}} at the address Landlord designates in writing for service of notices, which Landlord shall keep current with Tenant.

25. ADDITIONAL TERMS
{{additional_terms}}

26. ENTIRE AGREEMENT; SEVERABILITY; MODIFICATION
This Agreement, together with any attached addenda and disclosures, constitutes the entire agreement between the parties concerning the Premises and supersedes all prior oral or written agreements. If any provision of this Agreement is held invalid or unenforceable, the remainder shall continue in full force and effect. This Agreement may be modified only by a writing signed by both parties. Time is of the essence of this Agreement.

27. ACKNOWLEDGMENT AND SIGNATURES
Tenant acknowledges receipt of a copy of this Agreement and all disclosures referenced above. By signing below, the parties agree to the terms of this Agreement for the Premises at {{property_address}}, Unit {{unit_number}}, {{city}}, {{state}} {{zip}}, for the term {{lease_start_date}} through {{lease_end_date}} at a monthly rent of {{monthly_rent}}.

LANDLORD: {{landlord_name}}

Signature: ________________________________    Date: ________________

TENANT(S): {{tenant_names}}

Signature: ________________________________    Date: ________________

Printed name: _____________________________

Signature: ________________________________    Date: ________________

Printed name: _____________________________

Signature: ________________________________    Date: ________________

Printed name: _____________________________`,
};
