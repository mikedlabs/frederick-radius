# Overture reconciliation

_release 2026-05-20.0 · county bbox · 2026-05-30_

- Overture places in county: **17319**  (catalog: **1677**, ~10x)
- Catalog places matched to an Overture place (<=120m, name>=0.5): **1345** (80%)
- **Contact fills** available (catalog missing website/phone, Overture has it): **109**
- **Closure flags** (Overture operating_status = closed): **0**
- **Geocode suspects** (same-name Overture match >250m away): **65**
- **Net-new** high-confidence places not in catalog (>=0.9 conf, has category): **7018**

## Sample contact fills
```
  Dr Atul Purohit                  +website        (43m)
  Crossroads Valley Church         +website        (16m)
  Gallery 322                      +/phone         (4m)
  Hwy 15                           +website        (0m)
  Whiskey Ridge Farm               +/phone         (0m)
  Ibiza Cafe                       +/phone         (6m)
  Studio 509                       +website        (5m)
  Frederick Pump Track             +website        (6m)
  Elks W All Saints Street         +website        (8m)
  Mccurdy Field                    +/phone         (20m)
  East Street Liberty              +website        (1m)
  Sweet Clover                     +/phone         (0m)
  Blue Elephant                    +/phone         (0m)
  Comptroller Treasury             +website        (21m)
  Esthetics by Addie               +website/phone  (0m)
```
## Sample net-new (discovery candidates)
```
  7-Eleven                           convenience_store        conf=1.00
  Tires Plus                         tire_shop                conf=1.00
  Banda Burrito                      mexican_restaurant       conf=1.00
  NAPA Auto Parts                    auto_parts_and_supply_st conf=1.00
  7-Eleven                           convenience_store        conf=1.00
  Banda Burrito                      mexican_restaurant       conf=1.00
  Navy Federal Credit Union          credit_union             conf=1.00
  Terminix                           pest_control_service     conf=1.00
  Ehrlich Pest Control               pest_control_service     conf=1.00
  7-Eleven                           convenience_store        conf=1.00
  7-Eleven                           convenience_store        conf=1.00
  Schaefer Insurance Services LC     insurance_agency         conf=1.00
  Powell Insurance Agency            insurance_agency         conf=1.00
  NAPA Auto Parts                    auto_parts_and_supply_st conf=1.00
  Petco                              pet_store                conf=1.00
```