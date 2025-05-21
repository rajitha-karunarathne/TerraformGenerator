
import React, { useState, ChangeEvent, useCallback, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, GenerateContentResponse, Part } from '@google/genai';

// Ensure API_KEY is available, otherwise the app is non-functional.
// As per guidelines, this is assumed to be pre-configured.
// If (!process.env.API_KEY) {
//   throw new Error("API_KEY environment variable is not set. The application cannot start.");
// }

interface TerraformFile {
  fileName: string;
  content: string;
}

interface Tag {
  key: string;
  value: string;
}

const App: React.FC = () => {
  const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [terraformFiles, setTerraformFiles] = useState<TerraformFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copyButtonTexts, setCopyButtonTexts] = useState<Record<string, string>>({});

  const [tags, setTags] = useState<Tag[]>([]);
  const [currentTagKey, setCurrentTagKey] = useState<string>('');
  const [currentTagValue, setCurrentTagValue] = useState<string>('');

  useEffect(() => {
    let accentColorHex = 'var(--ios-blue-hex)'; 
    let accentColorDarkHex = 'var(--ios-blue-dark-hex)';
    let accentColorRgbString = '10, 132, 255'; // Default for iOS Blue: #0A84FF

    if (selectedProvider === 'AWS') {
      accentColorHex = 'var(--aws-orange-hex)';
      accentColorDarkHex = 'var(--aws-orange-dark-hex)';
      accentColorRgbString = '255, 153, 0'; // #FF9900
    } else if (selectedProvider === 'GCP') {
      accentColorHex = 'var(--gcp-green-hex)';
      accentColorDarkHex = 'var(--gcp-green-dark-hex)';
      accentColorRgbString = '52, 168, 83'; // #34A853
    } else if (selectedProvider === 'Azure') {
      accentColorHex = 'var(--azure-blue-hex)';
      accentColorDarkHex = 'var(--azure-blue-dark-hex)';
      accentColorRgbString = '0, 120, 212'; // #0078D4
    }
    
    // Retrieve actual hex values from CSS variables for consistency
    const rootStyles = getComputedStyle(document.documentElement);
    const finalAccentColor = rootStyles.getPropertyValue(accentColorHex.substring(4, accentColorHex.length -1 )).trim();
    const finalAccentColorDark = rootStyles.getPropertyValue(accentColorDarkHex.substring(4, accentColorDarkHex.length -1 )).trim();

    document.documentElement.style.setProperty('--provider-accent-color', finalAccentColor);
    document.documentElement.style.setProperty('--provider-accent-color-dark', finalAccentColorDark);
    document.documentElement.style.setProperty('--provider-accent-color-rgb', accentColorRgbString);
  }, [selectedProvider]);

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
      setTerraformFiles([]);
      setError(null);
      setCopyButtonTexts({});
    } else {
      setUploadedImageFile(null);
      setImagePreviewUrl(null);
    }
  };

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    setTerraformFiles([]);
    setError(null);
    setCopyButtonTexts({});
    // Optionally clear tags when provider changes, or keep them if preferred
    // setTags([]); 
  };

  const handleAddTag = () => {
    if (currentTagKey.trim() === '' || currentTagValue.trim() === '') {
      setError(`Key and Value for ${selectedProvider === 'GCP' ? 'labels' : 'tags'} cannot be empty.`);
      return;
    }
    if (tags.find(tag => tag.key === currentTagKey.trim())) {
        setError(`A ${selectedProvider === 'GCP' ? 'label' : 'tag'} with key "${currentTagKey.trim()}" already exists.`);
        return;
    }
    setTags([...tags, { key: currentTagKey.trim(), value: currentTagValue.trim() }]);
    setCurrentTagKey('');
    setCurrentTagValue('');
    setError(null);
  };

  const handleRemoveTag = (tagKeyToRemove: string) => {
    setTags(tags.filter(tag => tag.key !== tagKeyToRemove));
  };

  const fileToGenerativePart = async (file: File): Promise<Part> => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
  };

  const parseTerraformFiles = (responseText: string): TerraformFile[] => {
    const files: TerraformFile[] = [];
    const fileRegex = /\/\/\s*START_FILE:\s*([a-zA-Z0-9_.-]+\.tf)\s*\n([\s\S]*?)\n\/\/\s*END_FILE:\s*\1/g;
    let match;
    while ((match = fileRegex.exec(responseText)) !== null) {
      files.push({ fileName: match[1], content: match[2].trim() });
    }

    if (files.length === 0 && responseText.trim() !== '') {
        setError((prevError) => (prevError ? prevError + " " : "") + "Warning: AI did not structure the output into separate files as requested. Displaying raw output as generated_code.tf.");
        let fallbackContent = responseText.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const fenceMatch = fallbackContent.match(fenceRegex);
        if (fenceMatch && fenceMatch[2]) {
            fallbackContent = fenceMatch[2].trim();
        }
        files.push({ fileName: 'generated_code.tf', content: fallbackContent });
    }
    return files;
  };

  const generateTerraformCode = useCallback(async () => {
    if (!uploadedImageFile || !selectedProvider) {
      setError('Please upload an image and select a cloud provider.');
      return;
    }

    setIsLoading(true);
    setTerraformFiles([]);
    setError(null);
    setCopyButtonTexts({});

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      const imagePart = await fileToGenerativePart(uploadedImageFile);

      let tagsPromptPart = '';
      const tagType = selectedProvider === 'GCP' ? 'labels' : 'tags';
      if (tags.length > 0) {
        tagsPromptPart = `\nAdditionally, apply the following ${tagType} to the resources:\n`;
        tags.forEach(tag => {
          tagsPromptPart += `- ${tag.key}: ${tag.value}\n`;
        });
        tagsPromptPart += `\nFor ${selectedProvider}, ensure these ${tagType} are applied to relevant resources (e.g., instances, networks, storage, resource groups) according to ${selectedProvider} best practices. For AWS, consider using default_tags in the provider block if applicable. For Azure, apply to resource groups and individual resources. For GCP, apply as labels to resources.\n`;
      }

      const textPart = {
        text: `You are an expert AI assistant specialized in translating cloud architecture diagrams into Terraform code.
Analyze the provided image, which depicts a cloud application architecture.
Your task is to generate the complete and functional Terraform code required to provision this architecture on the ${selectedProvider} cloud platform, organized into separate, best-practice files.

Key requirements for the output:
1. Provider: ${selectedProvider}.
2. File Structure: Generate separate files for 'main.tf', 'variables.tf', and 'outputs.tf'. If applicable and sensible based on the diagram, also generate 'providers.tf' or other relevant files (e.g., 'network.tf', 'security.tf').
3. Format: For each file, provide pure Terraform HCL code.
4. Demarcation: Clearly separate the content of each file using the following format ON SEPARATE LINES:
   // START_FILE: filename.tf
   [HCL code for this file]
   // END_FILE: filename.tf
   Ensure NO other text or explanation is outside these demarcated blocks. The entire output must consist of these file blocks. Each marker must be on its own line.
5. Completeness: Include all necessary resources, configurations, and variables suggested by the diagram in the appropriate files. If details are ambiguous, make reasonable assumptions typical for such architectures. Define variables in 'variables.tf' and use them in 'main.tf'. Define outputs in 'outputs.tf'.
6. Best Practices: Adhere to ${selectedProvider} and Terraform best practices for code organization and content within each file.
${tagsPromptPart}
7. Output ONLY the demarcated Terraform HCL code blocks as specified. Do not include any surrounding text, markdown formatting (like \`\`\`hcl ... \`\`\`), or comments unless they are standard Terraform comments within the code itself.

Example for 'variables.tf':
// START_FILE: variables.tf
variable "region" {
  description = "The ${selectedProvider} region to deploy resources."
  type        = string
  default     = "us-west-2" # Adjust default based on common ${selectedProvider} regions.
}
// END_FILE: variables.tf

If the diagram is too generic or lacks detail for a specific ${selectedProvider} resource, provide a foundational Terraform structure (e.g., provider block in 'providers.tf' or 'main.tf', basic VPC/network setup in 'main.tf' if implied) and use placeholder comments for resources that would require more specific information from the diagram.
Focus on creating valid, usable, and well-organized Terraform code as the primary output.`,
      };

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: { parts: [imagePart, textPart] },
      });
      
      const generatedFiles = parseTerraformFiles(response.text);
      setTerraformFiles(generatedFiles);

      const initialCopyTexts: Record<string, string> = {};
      generatedFiles.forEach(file => {
        initialCopyTexts[file.fileName] = 'Copy';
      });
      setCopyButtonTexts(initialCopyTexts);

    } catch (err) {
      console.error('Error generating Terraform code:', err);
      let errorMessage = 'Failed to generate Terraform code. ';
      if (err instanceof Error) {
        errorMessage += err.message;
      } else {
        errorMessage += String(err);
      }
      if (errorMessage.toLowerCase().includes('api key not valid') || errorMessage.toLowerCase().includes('api_key_not_valid')) {
          errorMessage = 'API Key is invalid or not configured correctly. Please check your environment setup.';
      } else if (errorMessage.toLowerCase().includes('quota')) {
          errorMessage = 'API quota exceeded. Please check your Google AI Studio account.';
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [uploadedImageFile, selectedProvider, tags]);

  const copyToClipboard = (fileName: string, content: string) => {
    if (content) {
      navigator.clipboard.writeText(content)
        .then(() => {
          setCopyButtonTexts(prev => ({ ...prev, [fileName]: 'Copied!' }));
          setTimeout(() => setCopyButtonTexts(prev => ({ ...prev, [fileName]: 'Copy' })), 2000);
        })
        .catch(err => {
          console.error('Failed to copy text: ', err);
          setError(`Failed to copy ${fileName} to clipboard.`);
        });
    }
  };

  const handleDownloadFile = (fileName: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const isGenerateDisabled = !uploadedImageFile || !selectedProvider || isLoading;

  const tagLabel = useMemo(() => selectedProvider === 'GCP' ? 'Label' : 'Tag', [selectedProvider]);
  const tagsLabel = useMemo(() => selectedProvider === 'GCP' ? 'Labels' : 'Tags', [selectedProvider]);

  return (
    <div className="ios-container">
      <header className="ios-header">
        <h1>Terraform Generator</h1>
        <p>Diagram to Code, Simplified</p>
      </header>

      <div className="ios-section" role="region" aria-labelledby="upload-heading">
        <h2 id="upload-heading" className="ios-section-title">1. Upload Architecture Diagram</h2>
        <label htmlFor="imageUpload" className="ios-button-like-input-label">
          {uploadedImageFile ? `Selected: ${uploadedImageFile.name}` : 'Choose Diagram Image...'}
        </label>
        <input
          type="file"
          id="imageUpload"
          accept="image/*"
          onChange={handleImageUpload}
          aria-describedby={imagePreviewUrl ? "image-preview-desc" : undefined}
          className="ios-file-input"
        />
        {imagePreviewUrl && (
          <div className="image-preview-container">
            <p id="image-preview-desc" className="sr-only">Preview of uploaded image.</p>
            <img src={imagePreviewUrl} alt="Uploaded architecture diagram preview" className="image-preview" />
          </div>
        )}
      </div>

      <div className="ios-section" role="region" aria-labelledby="provider-heading">
        <h2 id="provider-heading" className="ios-section-title">2. Select Cloud Provider</h2>
        <div className="ios-segmented-control" role="radiogroup" aria-labelledby="provider-heading">
          {['AWS', 'GCP', 'Azure'].map(provider => (
            <button
              key={provider}
              onClick={() => handleProviderChange(provider)}
              className={`ios-segmented-control-button ${selectedProvider === provider ? 'active' : ''}`}
              role="radio"
              aria-checked={selectedProvider === provider}
              aria-label={provider}
            >
              {provider}
            </button>
          ))}
        </div>
      </div>

      {selectedProvider && (
        <div className="ios-section" role="region" aria-labelledby="tags-heading">
            <h2 id="tags-heading" className="ios-section-title">3. Add Resource {tagsLabel} (Optional)</h2>
            <div className="tag-input-group">
                <input
                    type="text"
                    placeholder="Key"
                    value={currentTagKey}
                    onChange={(e) => setCurrentTagKey(e.target.value)}
                    aria-label={`${tagLabel} Key`}
                    className="ios-input"
                />
                <input
                    type="text"
                    placeholder="Value"
                    value={currentTagValue}
                    onChange={(e) => setCurrentTagValue(e.target.value)}
                    aria-label={`${tagLabel} Value`}
                    className="ios-input"
                />
                <button onClick={handleAddTag} className="ios-button-secondary" aria-label={`Add ${tagLabel}`}>
                    + Add {tagLabel}
                </button>
            </div>
            {tags.length > 0 && (
                <ul className="tags-list" aria-label={`Current ${tagsLabel}`}>
                    {tags.map((tag) => (
                        <li key={tag.key} className="tag-item">
                            <span><strong>{tag.key}:</strong> {tag.value}</span>
                            <button 
                                onClick={() => handleRemoveTag(tag.key)} 
                                className="remove-tag-button"
                                aria-label={`Remove ${tagLabel} ${tag.key}: ${tag.value}`}
                            >
                                &times;
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
      )}

      <button 
        onClick={generateTerraformCode} 
        disabled={isGenerateDisabled} 
        className="ios-button-primary generate-button"
        aria-live="polite"
      >
        {isLoading ? (
          <>
            <span className="loading-spinner" aria-hidden="true"></span>
            Generating...
          </>
        ) : (
          `4. Generate Terraform Code for ${selectedProvider || '...'}`
        )}
      </button>

      {isLoading && (
        <div className="loading-message" role="status">
          <span className="loading-spinner" aria-hidden="true"></span> Generating Terraform code, please wait...
        </div>
      )}

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {terraformFiles.length > 0 && !isLoading && (
        <div className="ios-section output-area" role="region" aria-labelledby="output-heading">
          <h2 id="output-heading" className="ios-section-title">Generated Terraform Files ({selectedProvider})</h2>
          {terraformFiles.map((file, index) => (
            <div key={file.fileName + index} className="file-output-block" role="region" aria-labelledby={`file-heading-${index}`}>
              <div className="file-header">
                <h3 id={`file-heading-${index}`}>{file.fileName}</h3>
                <div className="file-actions">
                  <button 
                    onClick={() => copyToClipboard(file.fileName, file.content)} 
                    className={`ios-button-small ${copyButtonTexts[file.fileName] === 'Copied!' ? 'copied' : ''}`}
                    aria-label={`Copy code from ${file.fileName}`}
                  >
                    {copyButtonTexts[file.fileName] || 'Copy'}
                  </button>
                  <button 
                    onClick={() => handleDownloadFile(file.fileName, file.content)} 
                    className="ios-button-small download-button"
                    aria-label={`Download ${file.fileName}`}
                  >
                    Download
                  </button>
                </div>
              </div>
              <pre tabIndex={0}><code>{file.content}</code></pre>
            </div>
          ))}
        </div>
      )}
      <p className="sr-only" aria-live="assertive">
        {isLoading ? 'Terraform code generation in progress.' : ''}
        {error ? `An error occurred: ${error}` : ''}
        {terraformFiles.length > 0 && !isLoading ? `Terraform files for ${selectedProvider} have been generated.` : ''}
      </p>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error('Failed to find the root element');
}