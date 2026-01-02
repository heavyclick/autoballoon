export function PricingCard() {
  const tiers = [
    {
      name: 'Light',
      price: '$20',
      period: 'per month',
      description: 'Perfect for occasional validators',
      features: [
        '30 uploads per day',
        '150 uploads per month',
        'Full workbench access',
        'AS9102 Excel exports',
        'Ballooned PDF exports',
        'CMM import & matching',
        'Email support',
      ],
      cta: 'Start Light Plan',
      popular: false,
    },
    {
      name: 'Production',
      price: '$99',
      period: 'per month',
      description: 'For QA teams and high-volume users',
      features: [
        '100 uploads per day',
        '500 uploads per month',
        'Everything in Light, plus:',
        'Priority processing',
        'Revision comparison',
        'Priority email support',
        'Early access to features',
      ],
      cta: 'Start Production Plan',
      popular: true,
    },
  ];

  return (
    <div>
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-white mb-4">Simple, Fair Pricing</h2>
        <p className="text-brand-gray-400 max-w-2xl mx-auto">
          No hidden fees. No per-user charges. Cancel anytime.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`
              relative bg-brand-gray-900 border rounded-2xl p-8
              ${
                tier.popular
                  ? 'border-brand-red shadow-lg shadow-brand-red/10'
                  : 'border-brand-gray-800'
              }
            `}
          >
            {tier.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-brand-red text-white text-xs font-bold px-4 py-1 rounded-full">
                  MOST POPULAR
                </span>
              </div>
            )}

            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">{tier.name}</h3>
              <div className="flex items-baseline justify-center gap-1 mb-2">
                <span className="text-5xl font-bold text-white">{tier.price}</span>
                <span className="text-brand-gray-500 text-sm">{tier.period}</span>
              </div>
              <p className="text-brand-gray-400 text-sm">{tier.description}</p>
            </div>

            <ul className="space-y-3 mb-8">
              {tier.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span
                    className={
                      feature.startsWith('Everything')
                        ? 'text-brand-gray-500 text-sm'
                        : 'text-brand-gray-300 text-sm'
                    }
                  >
                    {feature}
                  </span>
                </li>
              ))}
            </ul>

            <button
              className={`
                w-full py-3 rounded-lg font-bold transition-colors
                ${
                  tier.popular
                    ? 'bg-brand-red hover:bg-brand-red/90 text-white'
                    : 'bg-brand-gray-800 hover:bg-brand-gray-700 text-white'
                }
              `}
            >
              {tier.cta}
            </button>
          </div>
        ))}
      </div>

      <div className="text-center mt-8">
        <p className="text-sm text-brand-gray-500">
          All plans include: Zero-storage security • ITAR/EAR compliance • 7-day money-back
          guarantee
        </p>
      </div>
    </div>
  );
}
