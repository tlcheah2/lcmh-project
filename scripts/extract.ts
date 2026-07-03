import "dotenv/config";
import LlamaCloud from "@llamaindex/llama-cloud";
import fs from "fs";

const client = new LlamaCloud({ apiKey: process.env.LLAMA_CLOUD_API_KEY });

// Schema from playground
const dataSchema = {
  type: "object",
  properties: {
    epd_id: {
      description:
        "Unique identifier for the Environmental Product Declaration.",
      type: "string",
    },
    product_name: {
      description: "The commercial name of the product as declared in the EPD.",
      type: "string",
    },
    product_type: {
      description:
        "The general type of the product, e.g., 'Ready-mix concrete'.",
      anyOf: [
        {
          description:
            "The general type of the product, e.g., 'Ready-mix concrete'.",
          type: "string",
        },
        {
          type: "null",
        },
      ],
    },
    epd_program_operator: {
      description: "The organization operating the EPD program.",
      type: "string",
    },
    epd_standards: {
      description:
        "List of standards the EPD complies with, e.g., EN 15804+A2, ISO 14025.",
      type: "array",
      items: {
        type: "string",
      },
    },
    epd_publication_date: {
      description: "Date when the EPD was published. Format: YYYY-MM-DD.",
      type: "string",
    },
    epd_last_updated_date: {
      description: "Date when the EPD was last updated. Format: YYYY-MM-DD.",
      anyOf: [
        {
          description:
            "Date when the EPD was last updated. Format: YYYY-MM-DD.",
          type: "string",
        },
        {
          type: "null",
        },
      ],
    },
    epd_valid_until_date: {
      description: "Date until which the EPD is valid. Format: YYYY-MM-DD.",
      type: "string",
    },
    manufacturer: {
      description: "Information about the product manufacturer.",
      type: "object",
      properties: {
        name: {
          description: "Name of the manufacturing company.",
          type: "string",
        },
        address: {
          description: "Manufacturer's main address.",
          anyOf: [
            {
              description: "Manufacturer's main address.",
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        contact_email: {
          description: "Contact email for the manufacturer.",
          anyOf: [
            {
              description: "Contact email for the manufacturer.",
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        website: {
          description: "Manufacturer's website.",
          anyOf: [
            {
              description: "Manufacturer's website.",
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["name", "address", "contact_email", "website"],
      additionalProperties: false,
    },
    manufacturing_location: {
      description:
        "Geographical location or region where the product is manufactured. Can be a single location or a grouped region.",
      type: "string",
    },
    manufacturing_sites: {
      description:
        "Specific sites covered by the EPD if multiple sites are grouped.",
      anyOf: [
        {
          description:
            "Specific sites covered by the EPD if multiple sites are grouped.",
          type: "array",
          items: {
            type: "string",
          },
        },
        {
          type: "null",
        },
      ],
    },
    product_characteristics: {
      description: "Key technical characteristics of the product.",
      type: "object",
      properties: {
        compressive_strength_mpa: {
          description:
            "Compressive strength of the concrete product in MPa, with provenance.",
          type: "object",
          properties: {
            value: {
              description: "The numerical value extracted.",
              type: "number",
            },
            page_number: {
              description:
                "The page number in the original document where this data was found.",
              type: "number",
            },
            excerpt: {
              description:
                "An excerpt of the original text from the document containing this data.",
              type: "string",
            },
          },
          required: ["value", "page_number", "excerpt"],
          additionalProperties: false,
        },
        strength_evaluation_days: {
          description:
            "Number of days at which the compressive strength was evaluated, with provenance. Null if not declared.",
          anyOf: [
            {
              description:
                "Number of days at which the compressive strength was evaluated, with provenance. Null if not declared.",
              type: "object",
              properties: {
                value: {
                  description: "The numerical value extracted.",
                  type: "number",
                },
                page_number: {
                  description:
                    "The page number in the original document where this data was found.",
                  type: "number",
                },
                excerpt: {
                  description:
                    "An excerpt of the original text from the document containing this data.",
                  type: "string",
                },
              },
              required: ["value", "page_number", "excerpt"],
              additionalProperties: false,
            },
            {
              type: "null",
            },
          ],
        },
        declared_unit: {
          description:
            "The functional or declared unit for the EPD, e.g., '1 cubic metre'.",
          type: "string",
        },
        declared_unit_mass_kg: {
          description:
            "Mass of the declared unit in kilograms, with provenance.",
          type: "object",
          properties: {
            value: {
              description: "The numerical value extracted.",
              type: "number",
            },
            page_number: {
              description:
                "The page number in the original document where this data was found.",
              type: "number",
            },
            excerpt: {
              description:
                "An excerpt of the original text from the document containing this data.",
              type: "string",
            },
          },
          required: ["value", "page_number", "excerpt"],
          additionalProperties: false,
        },
        portland_cement_reduction_percentage: {
          description:
            "Minimum portland cement reduction percentage compared to a reference case, if applicable, with provenance. Null if not declared.",
          anyOf: [
            {
              description:
                "Minimum portland cement reduction percentage compared to a reference case, if applicable, with provenance. Null if not declared.",
              type: "object",
              properties: {
                value: {
                  description: "The numerical value extracted.",
                  type: "number",
                },
                page_number: {
                  description:
                    "The page number in the original document where this data was found.",
                  type: "number",
                },
                excerpt: {
                  description:
                    "An excerpt of the original text from the document containing this data.",
                  type: "string",
                },
              },
              required: ["value", "page_number", "excerpt"],
              additionalProperties: false,
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: [
        "compressive_strength_mpa",
        "strength_evaluation_days",
        "declared_unit",
        "declared_unit_mass_kg",
        "portland_cement_reduction_percentage",
      ],
      additionalProperties: false,
    },
    life_cycle_scope: {
      description:
        "Description of the life cycle stages included in the EPD, e.g., 'Cradle-to-gate (A1-3) with modules C1-4, D'.",
      type: "string",
    },
    environmental_impacts: {
      description:
        "Environmental impact data across different life cycle stages.",
      type: "object",
      properties: {
        gwp_total: {
          description:
            "Global Warming Potential (GWP) - total, in kg CO₂e, across life cycle stages.",
          type: "object",
          properties: {
            unit: {
              type: "string",
              enum: ["kg CO₂e"],
            },
            A1: {
              description:
                "GWP for Raw materials supply (A1), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP for Raw materials supply (A1), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A2: {
              description:
                "GWP for Transport to factory (A2), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP for Transport to factory (A2), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A3: {
              description:
                "GWP for Manufacturing (A3), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP for Manufacturing (A3), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A1_A3: {
              description:
                "Total GWP for Product stage (A1-A3), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "Total GWP for Product stage (A1-A3), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A4: {
              description:
                "GWP for Transport to site (A4), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP for Transport to site (A4), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A5: {
              description:
                "GWP for Installation (A5), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP for Installation (A5), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            B1_B7: {
              description:
                "GWP for Use stage (B1-B7), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP for Use stage (B1-B7), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C1: {
              description:
                "GWP for Deconstruction/Demolition (C1), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP for Deconstruction/Demolition (C1), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C2: {
              description:
                "GWP for Transport to waste processing (C2), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP for Transport to waste processing (C2), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C3: {
              description:
                "GWP for Waste processing (C3), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP for Waste processing (C3), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C4: {
              description:
                "GWP for Disposal (C4), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP for Disposal (C4), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            D: {
              description:
                "GWP for Benefits and loads beyond the system boundary (D), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP for Benefits and loads beyond the system boundary (D), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
          },
          required: [
            "unit",
            "A1",
            "A2",
            "A3",
            "A1_A3",
            "A4",
            "A5",
            "B1_B7",
            "C1",
            "C2",
            "C3",
            "C4",
            "D",
          ],
          additionalProperties: false,
        },
        gwp_fossil: {
          description:
            "Global Warming Potential (GWP) - fossil, in kg CO₂e, across life cycle stages.",
          type: "object",
          properties: {
            unit: {
              type: "string",
              enum: ["kg CO₂e"],
            },
            A1: {
              description:
                "GWP fossil for Raw materials supply (A1), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP fossil for Raw materials supply (A1), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A2: {
              description:
                "GWP fossil for Transport to factory (A2), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP fossil for Transport to factory (A2), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A3: {
              description:
                "GWP fossil for Manufacturing (A3), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP fossil for Manufacturing (A3), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A1_A3: {
              description:
                "Total GWP fossil for Product stage (A1-A3), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "Total GWP fossil for Product stage (A1-A3), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C1: {
              description:
                "GWP fossil for Deconstruction/Demolition (C1), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP fossil for Deconstruction/Demolition (C1), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C2: {
              description:
                "GWP fossil for Transport to waste processing (C2), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP fossil for Transport to waste processing (C2), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C3: {
              description:
                "GWP fossil for Waste processing (C3), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP fossil for Waste processing (C3), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C4: {
              description:
                "GWP fossil for Disposal (C4), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP fossil for Disposal (C4), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            D: {
              description:
                "GWP fossil for Benefits and loads beyond the system boundary (D), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "GWP fossil for Benefits and loads beyond the system boundary (D), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
          },
          required: [
            "unit",
            "A1",
            "A2",
            "A3",
            "A1_A3",
            "C1",
            "C2",
            "C3",
            "C4",
            "D",
          ],
          additionalProperties: false,
        },
        adp_fossil_resources: {
          description:
            "Abiotic Depletion Potential (ADP) - fossil resources, in MJ, across life cycle stages.",
          type: "object",
          properties: {
            unit: {
              type: "string",
              enum: ["MJ"],
            },
            A1: {
              description:
                "ADP fossil for Raw materials supply (A1), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "ADP fossil for Raw materials supply (A1), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A2: {
              description:
                "ADP fossil for Transport to factory (A2), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "ADP fossil for Transport to factory (A2), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A3: {
              description:
                "ADP fossil for Manufacturing (A3), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "ADP fossil for Manufacturing (A3), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A1_A3: {
              description:
                "Total ADP fossil for Product stage (A1-A3), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "Total ADP fossil for Product stage (A1-A3), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C1: {
              description:
                "ADP fossil for Deconstruction/Demolition (C1), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "ADP fossil for Deconstruction/Demolition (C1), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C2: {
              description:
                "ADP fossil for Transport to waste processing (C2), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "ADP fossil for Transport to waste processing (C2), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C3: {
              description:
                "ADP fossil for Waste processing (C3), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "ADP fossil for Waste processing (C3), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C4: {
              description:
                "ADP fossil for Disposal (C4), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "ADP fossil for Disposal (C4), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            D: {
              description:
                "ADP fossil for Benefits and loads beyond the system boundary (D), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "ADP fossil for Benefits and loads beyond the system boundary (D), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
          },
          required: [
            "unit",
            "A1",
            "A2",
            "A3",
            "A1_A3",
            "C1",
            "C2",
            "C3",
            "C4",
            "D",
          ],
          additionalProperties: false,
        },
        water_use: {
          description: "Water use, in m³e depr., across life cycle stages.",
          type: "object",
          properties: {
            unit: {
              type: "string",
              enum: ["m³e depr."],
            },
            A1: {
              description:
                "Water use for Raw materials supply (A1), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "Water use for Raw materials supply (A1), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A2: {
              description:
                "Water use for Transport to factory (A2), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "Water use for Transport to factory (A2), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A3: {
              description:
                "Water use for Manufacturing (A3), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "Water use for Manufacturing (A3), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            A1_A3: {
              description:
                "Total Water use for Product stage (A1-A3), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "Total Water use for Product stage (A1-A3), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C1: {
              description:
                "Water use for Deconstruction/Demolition (C1), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "Water use for Deconstruction/Demolition (C1), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C2: {
              description:
                "Water use for Transport to waste processing (C2), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "Water use for Transport to waste processing (C2), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C3: {
              description:
                "Water use for Waste processing (C3), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "Water use for Waste processing (C3), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            C4: {
              description:
                "Water use for Disposal (C4), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "Water use for Disposal (C4), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
            D: {
              description:
                "Water use for Benefits and loads beyond the system boundary (D), with provenance. Null if not declared.",
              anyOf: [
                {
                  description:
                    "Water use for Benefits and loads beyond the system boundary (D), with provenance. Null if not declared.",
                  type: "object",
                  properties: {
                    value: {
                      description: "The numerical value extracted.",
                      type: "number",
                    },
                    page_number: {
                      description:
                        "The page number in the original document where this data was found.",
                      type: "number",
                    },
                    excerpt: {
                      description:
                        "An excerpt of the original text from the document containing this data.",
                      type: "string",
                    },
                  },
                  required: ["value", "page_number", "excerpt"],
                  additionalProperties: false,
                },
                {
                  type: "null",
                },
              ],
            },
          },
          required: [
            "unit",
            "A1",
            "A2",
            "A3",
            "A1_A3",
            "C1",
            "C2",
            "C3",
            "C4",
            "D",
          ],
          additionalProperties: false,
        },
      },
      required: [
        "gwp_total",
        "gwp_fossil",
        "adp_fossil_resources",
        "water_use",
      ],
      additionalProperties: false,
    },
    life_cycle_stage_status: {
      description:
        "Indicates whether a specific life cycle stage is declared ('declared') or not declared ('not_declared') in the EPD.",
      type: "object",
      properties: {
        A1: {
          description: "Status of Raw materials supply stage (A1).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        A2: {
          description: "Status of Transport to factory stage (A2).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        A3: {
          description: "Status of Manufacturing stage (A3).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        A4: {
          description: "Status of Transport to site stage (A4).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        A5: {
          description: "Status of Installation stage (A5).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        B1: {
          description: "Status of Use stage - Use (B1).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        B2: {
          description: "Status of Use stage - Maintenance (B2).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        B3: {
          description: "Status of Use stage - Repair (B3).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        B4: {
          description: "Status of Use stage - Replacement (B4).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        B5: {
          description: "Status of Use stage - Refurbishment (B5).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        B6: {
          description: "Status of Use stage - Operational energy use (B6).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        B7: {
          description: "Status of Use stage - Operational water use (B7).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        C1: {
          description:
            "Status of End-of-life stage - Deconstruction/Demolition (C1).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        C2: {
          description: "Status of End-of-life stage - Transport (C2).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        C3: {
          description: "Status of End-of-life stage - Waste processing (C3).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        C4: {
          description: "Status of End-of-life stage - Disposal (C4).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
        D: {
          description: "Status of Beyond the system boundary stage (D).",
          type: "string",
          enum: ["declared", "not_declared"],
        },
      },
      required: [
        "A1",
        "A2",
        "A3",
        "A4",
        "A5",
        "B1",
        "B2",
        "B3",
        "B4",
        "B5",
        "B6",
        "B7",
        "C1",
        "C2",
        "C3",
        "C4",
        "D",
      ],
      additionalProperties: false,
    },
  },
  required: [
    "epd_id",
    "product_name",
    "product_type",
    "epd_program_operator",
    "epd_standards",
    "epd_publication_date",
    "epd_last_updated_date",
    "epd_valid_until_date",
    "manufacturer",
    "manufacturing_location",
    "manufacturing_sites",
    "product_characteristics",
    "life_cycle_scope",
    "environmental_impacts",
    "life_cycle_stage_status",
  ],
  additionalProperties: false,
};

async function main() {
  // Upload
  const fileObj = await client.files.create({
    file: fs.createReadStream("./document.pdf"),
    purpose: "extract",
  });

  // Submit an extract job
  let job = await client.extract.create({
    file_input: fileObj.id,
    configuration: {
      data_schema: dataSchema,
      tier: "agentic",
      extraction_target: "per_doc",
      parse_tier: "agentic",
      cite_sources: true,
      confidence_scores: true,
    },
  });

  // Poll until the job reaches a terminal state
  while (!["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
    await new Promise((r) => setTimeout(r, 2000));
    job = await client.extract.get(job.id);
  }

  if (job.status !== "COMPLETED") {
    throw new Error(
      `Extract job ${job.id} ended in ${job.status}: ${job.error_message}`,
    );
  }

  // Persist extracted JSON to disk
  fs.writeFileSync(
    "extracted.json",
    JSON.stringify(job.extract_result, null, 2),
  );
  console.log(JSON.stringify(job.extract_result, null, 2));

  // Per-field citation / confidence metadata
  const docMeta = job.extract_metadata?.field_metadata?.document_metadata ?? {};
  for (const [field, meta] of Object.entries(docMeta)) {
    console.log(`${field}:`, meta);
  }
}

main().catch(console.error);
