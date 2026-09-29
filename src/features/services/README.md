# Student services

`StudentServices()` provides scholarship tariffs, contacts, and university history. `knowledge.ts` exports sourced entries for the FAQ assistant. The large public teacher snapshot lives in `teachers-data.ts`; `data.ts` remains small so the assistant does not import the full directory. Load `StudentServices.tsx` lazily from the application to defer that snapshot.

Run behavior checks with `node --test src/features/services/services.test.mjs`. Rates and public data were checked against official UUST sources on 27 September 2026. Source links, effective dates, and coverage limitations appear in the interface. Update data against the current official orders before changing a rate; never infer a payout by combining separate orders.

The calculator shows one selected tariff, with district-coefficient status. Temporary increases under order #0411 are explained separately and are not included in a promised total. Enhanced scholarships require commission appointment; activity points in PocketUUST have no bearing on stipend competition points.

The full published teacher table contains 1783 names and roles, but no faculty affiliations or direct contacts. Faculty lists contain 15 leaders and six additional IIMRT deputies. The interface explicitly marks this subset and links the original teacher table, faculty pages and the official scientific-unit/laboratory directory. Missing telephone, email, room or lab is labeled as unpublished, not inferred.

Styling uses existing theme colors and inherited application fonts; no new font dependency or global CSS is introduced.
