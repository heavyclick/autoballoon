export function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Drop Your Drawing',
      description:
        'PDF or image. Vector or raster. Multi-page or single. The system adapts instantly.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
      ),
    },
    {
      number: '02',
      title: 'AI Extracts Dimensions',
      description:
        'Vector text harvesting for 100% accuracy. OCR fallback for scanned drawings. Gemini parses tolerances, GD&T, and threads.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      ),
    },
    {
      number: '03',
      title: 'Validate & Export',
      description:
        'Review balloons on the canvas. Edit values inline. Click Export to get AS9102 Excel, ballooned PDF, or full ZIP bundle.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
  ];

  return (
    <div>
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-white mb-4">How It Works</h2>
        <p className="text-brand-gray-400 max-w-2xl mx-auto">
          From upload to export in seconds. No learning curve. No setup.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map((step) => (
          <div
            key={step.number}
            className="relative bg-brand-gray-900 border border-brand-gray-800 rounded-xl p-6 hover:border-brand-gray-700 transition-colors"
          >
            <div className="absolute top-6 right-6 text-5xl font-bold text-brand-gray-800">
              {step.number}
            </div>

            <div className="w-12 h-12 bg-brand-red/10 rounded-lg flex items-center justify-center mb-4 text-brand-red">
              {step.icon}
            </div>

            <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
            <p className="text-brand-gray-400 text-sm leading-relaxed">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
