'use client';

interface ResumePreviewProps {
  resumeText: string;
}

/**
 * ResumePreview component - renders resume as clean, printable HTML
 */
export default function ResumePreview({ resumeText }: ResumePreviewProps) {
  // Parse resume text into sections
  const parseResume = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const sections: { [key: string]: string[] } = {};
    let currentSection = 'Other';
    let name = '';
    let contactInfo: string[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const upperTrimmed = trimmed.toUpperCase();

      // Extract name (usually first non-empty line, or line with name-like pattern)
      if (index === 0 && trimmed.length > 0 && trimmed.length < 50) {
        name = trimmed;
        return;
      }

      // Check for contact info (email, phone, etc.)
      if (trimmed.includes('@') || /^[\d\s\-\(\)]+$/.test(trimmed)) {
        contactInfo.push(trimmed);
        return;
      }

      // Detect section headers
      if (
        upperTrimmed.includes('SUMMARY') ||
        upperTrimmed.includes('PROFESSIONAL SUMMARY') ||
        upperTrimmed.includes('OBJECTIVE')
      ) {
        currentSection = 'Summary';
        return;
      } else if (
        upperTrimmed.includes('EXPERIENCE') ||
        upperTrimmed.includes('WORK EXPERIENCE') ||
        upperTrimmed.includes('EMPLOYMENT')
      ) {
        currentSection = 'Experience';
        return;
      } else if (
        upperTrimmed.includes('SKILLS') ||
        upperTrimmed.includes('TECHNICAL SKILLS') ||
        upperTrimmed.includes('COMPETENCIES')
      ) {
        currentSection = 'Skills';
        return;
      } else if (
        upperTrimmed.includes('EDUCATION') ||
        upperTrimmed.includes('ACADEMIC')
      ) {
        currentSection = 'Education';
        return;
      } else if (
        upperTrimmed.includes('PROJECTS') ||
        upperTrimmed.includes('PORTFOLIO')
      ) {
        currentSection = 'Projects';
        return;
      }

      // Add line to current section
      if (!sections[currentSection]) {
        sections[currentSection] = [];
      }
      sections[currentSection].push(trimmed);
    });

    return { name, contactInfo, sections };
  };

  const { name, contactInfo, sections } = parseResume(resumeText);

  return (
    <div id="resume-preview" className="resume-preview">
      <style jsx>{`
        .resume-preview {
          font-family: 'Georgia', 'Times New Roman', serif;
          max-width: 8.5in;
          margin: 0 auto;
          padding: 0.75in;
          background: white;
          color: black;
          line-height: 1.6;
          font-size: 11pt;
        }
        .resume-name {
          font-size: 24pt;
          font-weight: bold;
          margin-bottom: 0.5em;
          text-align: center;
          border-bottom: 2px solid #333;
          padding-bottom: 0.3em;
        }
        .resume-contact {
          text-align: center;
          margin-bottom: 1em;
          font-size: 10pt;
          color: #555;
        }
        .resume-section {
          margin-bottom: 1.2em;
        }
        .resume-section-title {
          font-size: 14pt;
          font-weight: bold;
          margin-bottom: 0.5em;
          margin-top: 1em;
          text-transform: uppercase;
          border-bottom: 1px solid #ccc;
          padding-bottom: 0.2em;
        }
        .resume-item {
          margin-bottom: 0.8em;
        }
        .resume-bullet {
          margin-left: 1.5em;
          margin-bottom: 0.4em;
          position: relative;
        }
        .resume-bullet:before {
          content: '•';
          position: absolute;
          left: -1em;
        }
        .resume-paragraph {
          margin-bottom: 0.6em;
          text-align: justify;
        }
        @media print {
          .resume-preview {
            padding: 0.5in;
          }
        }
      `}</style>

      {/* Name */}
      {name && <div className="resume-name">{name}</div>}

      {/* Contact Info */}
      {contactInfo.length > 0 && (
        <div className="resume-contact">
          {contactInfo.join(' • ')}
        </div>
      )}

      {/* Summary Section */}
      {sections.Summary && sections.Summary.length > 0 && (
        <div className="resume-section">
          <div className="resume-section-title">Summary</div>
          <div className="resume-paragraph">
            {sections.Summary.join(' ')}
          </div>
        </div>
      )}

      {/* Experience Section */}
      {sections.Experience && sections.Experience.length > 0 && (
        <div className="resume-section">
          <div className="resume-section-title">Experience</div>
          {sections.Experience.map((item, idx) => (
            <div key={idx} className="resume-item">
              {item.startsWith('•') || item.startsWith('-') ? (
                <div className="resume-bullet">{item.replace(/^[•\-]\s*/, '')}</div>
              ) : (
                <div className="resume-paragraph">{item}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Skills Section */}
      {sections.Skills && sections.Skills.length > 0 && (
        <div className="resume-section">
          <div className="resume-section-title">Skills</div>
          <div className="resume-paragraph">
            {sections.Skills.join(', ')}
          </div>
        </div>
      )}

      {/* Education Section */}
      {sections.Education && sections.Education.length > 0 && (
        <div className="resume-section">
          <div className="resume-section-title">Education</div>
          {sections.Education.map((item, idx) => (
            <div key={idx} className="resume-item">
              <div className="resume-paragraph">{item}</div>
            </div>
          ))}
        </div>
      )}

      {/* Projects Section */}
      {sections.Projects && sections.Projects.length > 0 && (
        <div className="resume-section">
          <div className="resume-section-title">Projects</div>
          {sections.Projects.map((item, idx) => (
            <div key={idx} className="resume-item">
              {item.startsWith('•') || item.startsWith('-') ? (
                <div className="resume-bullet">{item.replace(/^[•\-]\s*/, '')}</div>
              ) : (
                <div className="resume-paragraph">{item}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Other Sections */}
      {sections.Other && sections.Other.length > 0 && (
        <div className="resume-section">
          {sections.Other.map((item, idx) => (
            <div key={idx} className="resume-item">
              {item.startsWith('•') || item.startsWith('-') ? (
                <div className="resume-bullet">{item.replace(/^[•\-]\s*/, '')}</div>
              ) : (
                <div className="resume-paragraph">{item}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

