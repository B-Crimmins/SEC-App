
const incomeStatementSections = [
    { title: 'REVENUES', keywords: ['revenue', 'sales', 'income from contract', 'net sales'] },
    { title: 'COST OF REVENUE', keywords: ['cost of goods', 'cost of revenue', 'cost of sales', 'cost of services'] },
    { title: 'GROSS PROFIT', keywords: ['gross profit'] },
    { title: 'OPERATING EXPENSES', keywords: ['research and development', 'rd', 'research', 'selling and marketing', 'marketing', 'advertising', 'general and administrative', 'g&a', 'administrative', 'operating expenses', 'total operating expenses'] },
    { title: 'OPERATING INCOME', keywords: ['operating income', 'operating profit', 'ebit', 'earnings before interest and taxes', 'income from operations'] },
    { title: 'OTHER INCOME (EXPENSE)', keywords: ['interest income', 'interest revenue', 'interest expense', 'interest', 'other income', 'other expense', 'gain', 'loss', 'non-operating', 'nonoperating', 'non operating'] },
    { title: 'INCOME BEFORE TAXES', keywords: ['income before taxes', 'pretax income', 'income from continuing operations'] },
    { title: 'INCOME TAX EXPENSE', keywords: ['income tax', 'tax expense', 'taxes', 'provision for income taxes'] },
    { title: 'PER SHARE DATA', keywords: ['earnings per share', 'eps', 'basic eps', 'diluted eps'] },
    { title: 'SHARES OUTSTANDING', keywords: ['shares outstanding', 'weighted average shares', 'basic shares', 'diluted shares'] },
    { title: 'NET INCOME', keywords: ['net income', 'net earnings', 'net profit', 'net income loss'] }
];

const balanceSheetSections = [
    { title: 'ASSETS', keywords: ['total assets'] },
    { title: 'CURRENT ASSETS', keywords: ['current assets', 'cash and cash equivalents', 'cash', 'short term investments', 'marketable securities', 'accounts receivable', 'receivables', 'inventory', 'prepaid expenses', 'prepaid', 'other current assets'] },
    { title: 'NON-CURRENT ASSETS', keywords: ['non current assets', 'property plant and equipment', 'ppe', 'fixed assets', 'accumulated depreciation', 'intangible assets', 'goodwill', 'other assets'] },
    { title: 'LIABILITIES', keywords: ['total liabilities'] },
    { title: 'CURRENT LIABILITIES', keywords: ['current liabilities', 'accounts payable', 'payables', 'accrued liabilities', 'accrued expenses', 'short term debt', 'current debt', 'other current liabilities'] },
    { title: 'NON-CURRENT LIABILITIES', keywords: ['non current liabilities', 'long term debt', 'long term borrowings', 'deferred tax liabilities', 'other liabilities'] },
    { title: 'SHAREHOLDERS\' EQUITY', keywords: ['total equity', 'stockholders equity', 'shareholders equity', 'common stock', 'capital stock', 'additional paid in capital', 'paid in capital', 'retained earnings', 'accumulated earnings', 'treasury stock', 'other equity', 'comprehensive income', 'accumulated other comprehensive income'] }
];

const cashFlowSections = [
    { title: 'CASH AND CASH EQUIVALENTS', keywords: ['cash and cash equivalents', 'cash', 'cash equivalents'] },
    { title: 'OPERATING ACTIVITIES', keywords: ['net income', 'depreciation and amortization', 'depreciation', 'stock based compensation', 'deferred taxes', 'changes in working capital', 'accounts receivable', 'inventory', 'accounts payable', 'other operating activities', 'net cash from operating activities'] },
    { title: 'INVESTING ACTIVITIES', keywords: ['capital expenditures', 'capex', 'acquisitions', 'business acquisitions', 'investments', 'other investing activities', 'net cash from investing activities'] },
    { title: 'FINANCING ACTIVITIES', keywords: ['debt issuance', 'borrowings', 'debt repayment', 'stock issuance', 'common stock issued', 'stock repurchases', 'treasury stock', 'dividends paid', 'other financing activities', 'net cash from financing activities'] },
    { title: 'NET CHANGE IN CASH', keywords: ['net change in cash', 'cash at beginning of period', 'cash at end of period'] }
];

export const usdFormatter = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
            });

export const organizeItemsBySections = (items, type) => {
    let organizedSections = [];
    let usedConcepts = new Set();
    let sections = [];

    if (type === 'INCOME') {
        sections = incomeStatementSections;
    }

    if (type === 'BALANCE') {
        sections = balanceSheetSections
    }

    if (type === 'CASHFLOW') {
        sections = cashFlowSections;
    }


    // Process each section in order
    for (const section of sections) {
        let sectionItems = [];

        // Find items that match this section's keywords
        for (const [concept, data] of Object.entries(items)) {
            if (!usedConcepts.has(concept)) {
                const label = data?.label || concept;
                if (label) {
                    const labelLower = label.toLowerCase();
                    // Check if this item matches any keyword in the section
                    const matchesSection = section.keywords.some(keyword => {
                        const keywordLower = keyword.toLowerCase();
                        // More precise matching to avoid false positives
                        if (section.title === 'OPERATING INCOME') {
                            // For operating income, be more specific to avoid matching "nonoperating"
                            return (
                                (keywordLower === 'operating income' && labelLower.includes('operating income')) ||
                                (keywordLower === 'operating profit' && labelLower.includes('operating profit')) ||
                                (keywordLower === 'ebit' && labelLower.includes('ebit')) ||
                                (keywordLower === 'earnings before interest and taxes' && labelLower.includes('earnings before interest and taxes')) ||
                                (keywordLower === 'income from operations' && labelLower.includes('income from operations'))
                            ) && !labelLower.includes('nonoperating') && !labelLower.includes('non-operating');
                        } else if (section.title === 'NET INCOME') {
                            // For net income, be very specific to avoid matching other income items
                            return (
                                (keywordLower === 'net income' && labelLower.includes('net income')) ||
                                (keywordLower === 'net earnings' && labelLower.includes('net earnings')) ||
                                (keywordLower === 'net profit' && labelLower.includes('net profit')) ||
                                (keywordLower === 'net income loss' && labelLower.includes('net income loss'))
                            ) && !labelLower.includes('operating income') && !labelLower.includes('other income');
                        } else if (section.title === 'OTHER INCOME (EXPENSE)') {
                            // For other income, exclude net income items
                            return (
                                labelLower.includes(keywordLower) &&
                                !labelLower.includes('net income') &&
                                !labelLower.includes('net earnings') &&
                                !labelLower.includes('net profit')
                            );
                        } else {
                            // For other sections, use the original logic
                            return labelLower.includes(keywordLower);
                        }
                    });

                    if (matchesSection) {
                        // Debug logging for operating income section
                        if (section.title === 'OPERATING INCOME') {
                           // console.log(`🔍 OPERATING INCOME: Matched "${label}" with keywords:`, section.keywords);
                        }
                        sectionItems.push([concept, data]);
                        usedConcepts.add(concept);
                    }
                }
            }
        }

        // Only add section if it has items
        if (sectionItems.length > 0) {
            organizedSections.push({
                title: section.title,
                keywords: section.keywords,
                items: sectionItems.sort((a, b) => (a[1]?.label || a[0]).toLowerCase().localeCompare((b[1]?.label || b[0]).toLowerCase()))
            });
        }
    }

    // Add remaining uncategorized items
    let remainingItems = [];
    for (const [concept, data] of Object.entries(items)) {
        if (!usedConcepts.has(concept)) {
            remainingItems.push([concept, data]);
        }
    }

    if (remainingItems.length > 0) {
        organizedSections.push({
            title: 'OTHER ITEMS',
            keywords: [],
            items: remainingItems.sort((a, b) => (a[1]?.label || a[0]).toLowerCase().localeCompare((b[1]?.label || b[0]).toLowerCase()))
        });
    }

    return organizedSections;
};

export const filterUsGaap = (items) => {
    return Object.fromEntries(
        Object.entries(items).filter(([key]) => key.toLowerCase().startsWith('us-gaap'))
    );
};

export const TableDiff = (arrayA, arrayB) => {

    let arr = [];
    for (let i = 0; i < arrayA.length; i++) {
        let belement = arrayB.find(x => x[0] === arrayA[i][0]);

        if (!Boolean(belement)) {
            arr.push({ label: arrayA[i][0], year1: arrayA[i][1], year2: null });
        }
        else {
            arr.push({ label: arrayA[i][0], year1: arrayA[i][1], year2: belement[1] });
        }


    }

    for (let i = 0; i < arrayB.length; i++) {
        let belement = arrayA.find(x => x[0] === arrayB[i][0]);

        if (!Boolean(belement)) {
            arr.push({ label: arrayB[i][0], year1: null, year2: arrayB[i][1] });
        }

        let exists = arr.find(x => x.label === arrayB[i][0]);

        if (!Boolean(exists)) {
            arr.push({ label: arrayB[i][0], year1: belement[i][1], year2: arrayB[i][1] });
        }

    }

    return arr

}

export const FormatTable = (statementArrays) => {
    //Do Stuff
}
