# Chicago Home Estimator

## Start your next pricing conversation with the numbers in hand.

Chicago Home Estimator helps real estate agents prepare for conversations with buyers and sellers. Enter a home's recorded characteristics to get an estimated sale price, review historical sales, and explore transaction activity in its ZIP code—all in one place.

**[Try this Estimator](https://chicago-home-estimator.vercel.app/#estimate)**

No installation is needed. Open the website in your browser and have the property's recorded details ready.

## Built for your day-to-day work

Whether you are preparing for a seller meeting or reviewing a property with a buyer, the tool gives you a starting estimate and supporting information to discuss.

- **Estimate a sale price.** Use the home's location, size, age, property class, and room counts to calculate an estimate based on recorded sales.
- **Review historical examples.** Browse past sales matched by ZIP and, optionally, Assessor neighborhood, then ranked by building-area similarity.
- **Check the local picture.** Explore monthly sale prices and transaction counts, with comparisons covering equivalent calendar periods.
- **Keep a record.** Download the entered property details and estimate as a JSON summary for your notes.
- **Understand the numbers.** Review the data sources, model accuracy, and coverage limitations on the About page.

## Get an estimate

1. Open **[Get an Estimate](https://chicago-home-estimator.vercel.app/#estimate)**.
2. Type or select the property's ZIP code. If you know its verified Assessor neighborhood code, add it to narrow the historical sales shown; otherwise leave **Not provided**.
3. Select the recorded Assessor property class. Check the property's Assessor record rather than inferring the class from its ZIP or appearance.
4. Enter the exterior building area, lot area, year built, bedrooms, and full and half bathrooms. Exterior building area may differ from the interior living area shown in a listing.
5. Choose **See My Estimate**. The tool applies today's Chicago date automatically.
6. Review the result and supporting sales. Use **Edit Property Details** to correct an input, or **Save Summary** to keep a copy.

For broader context, open **[Explore Sales](https://chicago-home-estimator.vercel.app/#market)** and search by ZIP. The charts show the available monthly history; table controls let you browse 10, 20, 50, or 100 monthly records at a time.

## Explore sales on the ZIP map

After getting an estimate, use the map beside the price summary. Hover over an area to see its ZIP and historical-example count, then click or tap to compare up to five sales against your home. You can also select an area using the ZIP list or use Tab and Enter on the map. **Back to my ZIP** restores the original location.

Your home and estimated price stay visible as you explore. Explore Sales also includes a Chicago map: select an area to update the transaction count, median price, charts, and monthly table. The Overview below your estimate shows the entered details in two side-by-side tables on larger screens.

The displayed median summarizes only the selected historical examples; it is not a revised estimate. Examples are ranked by building-area similarity and bedroom/full-bathroom differences, with newer sales breaking ties. Cross-ZIP prices are not adjusted for location or time.

The map uses locally stored City of Chicago ZIP boundaries and has no map API fees or billing setup. It shows approximate areas, not individual house locations. ZIP choices are restricted to the City of Chicago boundary list; estimates additionally require a ZIP supported by the model. Areas with no available examples show an empty-state message.

## Know what the estimate covers

The tool supports selected single-family residential classes and individually owned townhomes or row houses in the ZIP codes available on the site. It does not cover every property type or location.

The estimate uses property characteristics, ZIP, and date-based features. The optional Assessor neighborhood code filters historical examples; it does not change the estimated price. Historical matching does not account for every difference in condition, renovations, layout, or transaction circumstances, so review each example before treating it as a suitable comparable.

The supplied records cover **September 1, 2019–August 11, 2026**. Estimates after that period extend the model's fitted time trend; accuracy for those later dates has not been established. Market summaries describe the supplied transaction sample, not current listings or all Chicago properties.

## Use it alongside your professional judgment

A home's condition, recent improvements, and current competition deserve a closer look than these records can provide. Treat the result as a starting point for your assessment, alongside suitable recent comparable sales and your knowledge of the property.

Chicago Home Estimator is a BUSA 310 student prototype. It provides an estimated sale price—not an appraisal, an optimal asking price, or a guaranteed transaction value. Reported average error describes performance across evaluated sales and is not a price range for an individual home. No calibrated property-specific prediction interval is provided.

**[Open Chicago Home Estimator](https://chicago-home-estimator.vercel.app/#estimate)**
