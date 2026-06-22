import pandas as pd
import pdfplumber
import tabula as tb
import re

# with pdf.open("sloos-202601-table1.pdf") as pdf_file:
#     for page in pdf_file.pages:
#         table = page.extract_table()
#         # print(table)

# pdf_path = "Call_Cert9846_033125.pdf"

# all_tables = []

# with pdf.open(pdf_path) as pdf:
#     for page_num, page in enumerate(pdf.pages, start=1):
#         tables = page.extract_tables()

#         for table in tables:
#             df = pd.DataFrame(table)
#             df["page"] = page_num
#             all_tables.append(df)

# final_df = pd.concat(all_tables, ignore_index=True)

# final_df.to_excel("call_report_extracted_tables.xlsx", index=False)


PDF_PATH = "Call_Cert9846_033125.pdf"
OUT_PATH = "call_report_mdrm_schema.xlsx"

# target columns from your screenshot
COLUMNS = [
    "mdrm_code",
    "short_description",
    "schedule_code",
    "statement_bucket",
    "category",
    "subcategory",
    "detail",
    "risk_type",
    "measurement_type",
    "sign",
    "code_prefix",
    "report_form_scope",
    "is_common_kpi_driver",
    "source_basis",
    "classification_status",
    "notes",
]

def infer_code_prefix(code: str) -> str:
    return re.match(r"^[A-Z]+", code).group(0)

def infer_schedule(line: str, code: str) -> str:
    text = line.upper()

    if "RIAD" in code:
        if "CHARGE-OFF" in text or "CHARGEOFF" in text:
            return "RI-B"
        return "RI"

    if code.startswith(("RCFD", "RCON", "RCFA", "RCFN", "RCOA")):
        return "RC"

    return ""

def infer_bucket_category(desc: str, code: str):
    d = desc.lower()

    if "total assets" in d:
        return "Assets", "Total Assets", "Aggregate", "Total assets", "Balance Sheet", 1, "Y"

    if "deposit" in d:
        return "Liabilities", "Deposits", "Total Deposits", desc, "Funding", -1, "Y"

    if "cash" in d or "balances due from" in d:
        return "Assets", "Cash", "Cash & Due From", desc, "Liquidity", 1, "Y"

    if "federal funds sold" in d or "securities purchased under agreements to resell" in d:
        return "Assets", "Short-Term Investments", "Fed Funds / Reverse Repo", desc, "Liquidity", 1, "N"

    if "federal funds purchased" in d or "securities sold under agreements to repurchase" in d:
        return "Liabilities", "Borrowings", "Fed Funds / Repo", desc, "Funding", -1, "N"

    if "allowance" in d and ("loan" in d or "lease" in d):
        return "Assets Contra", "Reserves", "Allowance", desc, "Credit", -1, "Y"

    if "charge-off" in d or "charge off" in d:
        return "Income Statement", "Credit Losses", "Charge-Offs", desc, "Credit", -1, "Y"

    if "loan" in d:
        return "Assets", "Loans", "Loans", desc, "Credit", 1, "Y"

    if "trading asset" in d:
        return "Assets", "Trading Assets", "Trading Book", desc, "Market", 1, "N"

    if "equity capital" in d or "capital" in d:
        return "Equity", "Capital", "Book Equity", desc, "Capital", 1, "Y"

    if "goodwill" in d or "intangible" in d:
        return "Assets", "Intangibles", "Intangibles", desc, "Capital", 1, "N"

    if "other liabilities" in d:
        return "Liabilities", "Borrowings", "Other Borrowings", desc, "Funding", -1, "N"

    if "other assets" in d:
        return "Assets", "Other Assets", "Other", desc, "Other", 1, "N"

    return "", "", "", desc, "", 1, "N"

def clean_description(line: str, code: str) -> str:
    """
    Removes MDRM code and common trailing numeric values from line.
    """
    text = line.replace(code, " ")
    text = re.sub(r"\s+", " ", text).strip()

    # remove dollar amounts / numeric report values at end
    text = re.sub(r"\s+[-]?\d{1,3}(,\d{3})*(\.\d+)?$", "", text).strip()

    # remove item numbers like 1.a, 2.b, etc.
    text = re.sub(r"^\d+(\.[a-z])?\s+", "", text, flags=re.I).strip()

    return text

rows = []

with pdfplumber.open(PDF_PATH) as pdf:
    for page_num, page in enumerate(pdf.pages, start=1):
        text = page.extract_text() or ""

        for line in text.split("\n"):
            codes = re.findall(r"\b(?:RIAD|RCFD|RCON|RCFA|RCFN|RCOA|RCRI)[A-Z0-9]{4,}\b", line)

            for code in codes:
                desc = clean_description(line, code)
                prefix = infer_code_prefix(code)
                schedule = infer_schedule(line, code)

                (
                    statement_bucket,
                    category,
                    subcategory,
                    detail,
                    risk_type,
                    sign,
                    is_common,
                ) = infer_bucket_category(desc, code)

                if prefix in ["RCFA", "RCFN", "RCOA"]:
                    scope = "031 only"
                else:
                    scope = "031/041/051"

                rows.append({
                    "mdrm_code": code,
                    "short_description": desc,
                    "schedule_code": schedule,
                    "statement_bucket": statement_bucket,
                    "category": category,
                    "subcategory": subcategory,
                    "detail": detail,
                    "risk_type": risk_type,
                    "measurement_type": "Stock" if schedule == "RC" else "Flow",
                    "sign": sign,
                    "code_prefix": prefix,
                    "report_form_scope": scope,
                    "is_common_kpi_driver": is_common,
                    "source_basis": "PDF extracted line item",
                    "classification_status": "Derived categories",
                    "notes": f"Extracted from page {page_num}",
                })

df = pd.DataFrame(rows)

# remove duplicates
df = df.drop_duplicates(subset=["mdrm_code", "short_description"])

# force column order
df = df[COLUMNS]

# export
df.to_excel(OUT_PATH, index=False)
print(f"Saved: {OUT_PATH}")

