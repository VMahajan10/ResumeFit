// PDF Generator utility using html2pdf.js

// Dynamic import to avoid SSR issues
let html2pdf: any = null;

/**
 * Generate filename from job title and date
 */
function generateFilename(jobText?: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  if (jobText) {
    // Try to extract job title from job description
    // Look for common patterns like "Job Title:", "Position:", or first line
    const lines = jobText.split('\n').filter(line => line.trim().length > 0);
    const firstLine = lines[0]?.trim() || '';
    
    // Check if first line looks like a job title (not too long, no special chars)
    if (firstLine.length < 60 && !firstLine.includes('http')) {
      const sanitized = firstLine
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 40);
      return `ResumeFit_${sanitized}_${date}.pdf`;
    }
  }
  
  return `ResumeFit_Resume_${date}.pdf`;
}

/**
 * Download resume as PDF
 */
export async function downloadResumePDF(
  resumeText: string,
  jobText?: string
): Promise<void> {
  if (!resumeText.trim()) {
    throw new Error('Resume text is empty');
  }

  // Dynamically import html2pdf.js (client-side only)
  if (!html2pdf) {
    const html2pdfModule = await import('html2pdf.js');
    html2pdf = html2pdfModule.default as any;
  }

  // Create a temporary container for the resume preview
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);

  try {
    // Import and render the ResumePreview component
    const { default: ResumePreview } = await import('@/components/ResumePreview');
    const React = await import('react');
    const ReactDOM = await import('react-dom/client');

    // Create root and render
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(ResumePreview, { resumeText }));

    // Wait for render to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    const element = container.querySelector('#resume-preview') || container;

    // Configure PDF options
    const opt = {
      margin: [0.5, 0.5, 0.5, 0.5],
      filename: generateFilename(jobText),
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
      },
      jsPDF: {
        unit: 'in',
        format: 'letter',
        orientation: 'portrait',
      },
    };

    // Generate and download PDF
    await html2pdf().set(opt).from(element).save();

    // Cleanup
    root.unmount();
    document.body.removeChild(container);
  } catch (error) {
    // Cleanup on error
    if (container.parentNode) {
      document.body.removeChild(container);
    }
    console.error('PDF generation failed:', error);
    throw error;
  }
}

