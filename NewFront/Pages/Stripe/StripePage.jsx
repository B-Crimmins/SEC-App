import { Button } from '../../src/components/ui/button';
import { Card } from '../../src/components/ui/card';
import { Badge } from '../../src/components/ui/badge';

const FREE_INCLUDED = [
  '10 API calls per month',
  'Basic financial data access',
  'Standard CSV export',
  'Company search functionality',
  'Basic financial reports',
];

const FREE_LIMITS = [
  'No AI-powered analysis',
  'Limited data retention',
  'Standard CSV export',
  'Standard processing speed',
  'No priority support',
];

const PRO_INCLUDED = [
  '1000 API calls per month',
  'Advanced AI-powered analysis',
  'Multi-period trend analysis',
  'Priority processing',
  'Extended data retention',
  'Advanced CSV export',
  'Peer group analysis',
  'Priority customer support',
];

const StripePage = () => {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-4xl font-semibold text-center">Choose Your Plan</h1>
      <p className="text-center text-muted-foreground mt-3 max-w-2xl mx-auto">
        Get access to powerful financial analysis tools. Start free and upgrade when you need more features.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
        <Card className="p-8 flex flex-col">
          <div className="text-2xl font-medium">Free</div>
          <div className="text-3xl font-medium mt-3">$0 / month</div>
          <div className="text-lg font-medium mt-3">Great for getting started with our financial data analysis</div>

          <div className="flex-1 mt-4 space-y-4">
            <div>
              <div className="font-medium mb-2">What's included:</div>
              <ul className="space-y-1.5">
                {FREE_INCLUDED.map((item) => (
                  <li key={item} className="text-sm text-muted-foreground">{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-medium mb-2">Limitations:</div>
              <ul className="space-y-1.5">
                {FREE_LIMITS.map((item) => (
                  <li key={item} className="text-sm text-muted-foreground">{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <Button variant="outline" className="w-full mt-6">Get started for free</Button>
        </Card>

        <div className="relative">
          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-accent text-accent-foreground">
            Most Popular
          </Badge>
          <Card className="p-8 flex flex-col h-full border-accent/50">
            <div className="text-2xl font-medium">Pro Subscription</div>
            <div className="text-3xl font-medium mt-3">$29 / month</div>
            <div className="text-lg font-medium mt-3">Advanced features and tools for professional analysis</div>

            <div className="flex-1 mt-4">
              <div className="font-medium mb-2">What's included:</div>
              <ul className="space-y-1.5">
                {PRO_INCLUDED.map((item) => (
                  <li key={item} className="text-sm text-muted-foreground">{item}</li>
                ))}
              </ul>
            </div>

            <Button className="w-full mt-6 bg-gradient-to-r from-accent to-primary text-primary-foreground hover:opacity-90">
              Subscribe Now
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default StripePage;
