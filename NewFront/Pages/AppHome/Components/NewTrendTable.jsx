import React from 'react';
import { Table, Title, Text, Stack, Paper, Group } from '@mantine/core';

const formatCurrency = (value) => {
  if (value === null || value === undefined) {
    return '-';
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const STATEMENT_TITLES = {
  balance_sheet: 'Balance Sheet',
  income_statement: 'Income Statement',
  cash_flow: 'Cash Flow Statement',
};

const FinancialStatementViewer = ({ data, statementType }) => {
  if (!data.companies || data.companies.length === 0) {
    return <Text>No data available</Text>;
  }

  const statementsToRender = statementType
    ? [statementType]
    : ['balance_sheet', 'cash_flow', 'income_statement'];

  const renderCategorySection = (categoryTitle, categoryData, years) => {
    if (!categoryData || categoryData.length === 0) {
      return null;
    }

    return (
      <Stack spacing="xs" mb="lg">
        <Title order={5} className="category-title">
          {categoryTitle}
        </Title>
        
        <Paper mb={10} withBorder shadow="xs" p="xl">
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                {years.map(year => (
                  <Table.Th ta={'right'} key={year}>{year}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {categoryData.map((item, idx) => (
                <Table.Tr key={`${item.gaap_name}-${idx}`}>
                  <Table.Td>{item.type}</Table.Td>
                  {years.map(year => (
                    <Table.Td ta='right' w={50} key={year}>
                      {formatCurrency(item.values[year])}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      </Stack>
    );
  };
  

//   const renderCategorySection = (categoryTitle, categoryData) => {
//     if (!categoryData || categoryData.length === 0) {
//       return null;
//     }

//     return (
//       <Stack spacing="xs" mb="lg">
//         <Title order={5} className="category-title">
//           {categoryTitle}
//         </Title>
        
//         <Paper>
//           <Table highlightOnHover>
//             <thead>
//               <tr>
//                 <th>Type</th>
//                 {years.map(year => (
//                   <th key={year}>{year}</th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody>
//               {categoryData.map((item, idx) => (
//                 <tr key={`${item.gaap_name}-${idx}`}>
//                   <td>{item.type}</td>
//                   {years.map(year => (
//                     <td key={year}>
//                       {formatCurrency(item.values[year])}
//                     </td>
//                   ))}
//                 </tr>
//               ))}
//             </tbody>
//           </Table>
//         </Paper>
//       </Stack>
//     );
//   };

  const renderStatementWithCategories = (statementTitle, statementData, years, key) => {
    if (!statementData) {
      return null;
    }
    const categories = Object.keys(statementData);

    if (categories.length === 0) {
      return null;
    }

    return (
      <Stack key={key} spacing="md" mb="xl">
        <Title order={3} className="statement-title">
          {statementTitle}
        </Title>

        {categories.map(category =>
          renderCategorySection(category, statementData[category], years)
        )}
      </Stack>
    );
  };

  return (
    <div className="financial-statement-viewer">
      <Stack spacing="xl">
        {data.companies.map((company) => (
          <Stack spacing="xl" key={company.company.cik} mb="xl">
            <Group position="apart" mb="md">
              <div>
                <Title order={2} className="company-name">
                  {company.company.name}
                </Title>
                <Text size="sm" color="dimmed">
                  CIK: {company.company.cik}
                </Text>
              </div>
            </Group>

            {statementsToRender.map((stmt) =>
              renderStatementWithCategories(
                STATEMENT_TITLES[stmt],
                company.statements?.[stmt],
                company.years,
                stmt
              )
            )}
          </Stack>
        ))}
      </Stack>
    </div>
  );
};

export default FinancialStatementViewer;