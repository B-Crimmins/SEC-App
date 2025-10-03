export const organizeItemsBySections = (items, sections) => {
    let organizedSections = [];
    let usedConcepts = new Set();

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
                            console.log(`🔍 OPERATING INCOME: Matched "${label}" with keywords:`, section.keywords);
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
