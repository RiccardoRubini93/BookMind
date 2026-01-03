// We access the global window object because we loaded PDF.js via CDN in index.html
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

export const convertFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      let encoded = reader.result as string;
      // Remove data:application/pdf;base64, prefix if present
      encoded = encoded.split(',')[1];
      resolve(encoded);
    };
    reader.onerror = error => reject(error);
  });
};

export const extractTextFromPDF = async (file: File): Promise<{ text: string, isScanned: boolean }> => {
  if (!window.pdfjsLib) {
    throw new Error('PDF library not loaded. Please refresh the page.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = '';
  const numPages = pdf.numPages;
  let totalContentLength = 0;

  for (let i = 1; i <= numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Basic heuristic: check if the page has text items
      // We join with space, but also double newline for paragraph separation
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      if (pageText.trim().length > 0) {
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
        totalContentLength += pageText.trim().length;
      }
    } catch (e) {
      console.warn(`Error extracting page ${i}`, e);
    }
  }

  // Heuristic for scanned document:
  // If we have pages but very little text (avg < 50 chars per page), it's likely scanned or image-heavy.
  const isScanned = numPages > 0 && (totalContentLength / numPages) < 50;

  return { text: fullText.trim(), isScanned };
};

/**
 * A robust helper to find the text content of a specific chapter 
 * using regex to handle whitespace inconsistencies.
 */
export const findChapterText = (fullText: string, chapterTitle: string, nextChapterTitle: string | null): string | null => {
  // Helper to escape regex special characters
  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // Helper to create a flexible regex pattern from a string
  const createFlexiblePattern = (text: string) => {
    // Remove extra spaces from search term first
    const cleanText = text.trim().replace(/\s+/g, ' ');
    const escaped = escapeRegExp(cleanText);
    return escaped.split(' ').join('\\s+');
  };

  const titlePattern = createFlexiblePattern(chapterTitle);
  const titleRegex = new RegExp(titlePattern, 'gi'); // Global to find all matches, Case insensitive
  
  // Find all matches
  let match;
  const matches = [];
  while ((match = titleRegex.exec(fullText)) !== null) {
    matches.push(match.index);
  }

  let startIndex = -1;

  // Heuristic: If we have multiple matches, and the first one is extremely early (TOC),
  // prefer the second one.
  if (matches.length > 0) {
    if (matches.length > 1 && matches[0] < fullText.length * 0.05) {
      // If first match is in first 5% of text, assume it's TOC and take the next one
      startIndex = matches[1];
    } else {
      startIndex = matches[0];
    }
  }

  // Fallback 1: Partial title match (first 8 words)
  if (startIndex === -1) {
      const words = chapterTitle.split(/\s+/);
      if (words.length > 3) {
        const shortTitle = words.slice(0, Math.min(words.length, 8)).join(' ');
        const shortPattern = createFlexiblePattern(shortTitle);
        const shortRegex = new RegExp(shortPattern, 'i');
        const m = shortRegex.exec(fullText);
        if (m) startIndex = m.index;
      }
  }

  // Fallback 2: "Chapter X" pattern
  if (startIndex === -1) {
     const numberMatch = chapterTitle.match(/^(Chapter\s+\d+|Part\s+\d+)/i);
     if (numberMatch) {
         const numPattern = createFlexiblePattern(numberMatch[0]);
         const numRegex = new RegExp(numPattern, 'gi'); // Global to find potential real chapter start vs TOC
         
         const numMatches = [];
         let m;
         while ((m = numRegex.exec(fullText)) !== null) {
            numMatches.push(m.index);
         }

         if (numMatches.length > 0) {
            // Same TOC avoidance heuristic
            if (numMatches.length > 1 && numMatches[0] < fullText.length * 0.05) {
              startIndex = numMatches[1];
            } else {
              startIndex = numMatches[0];
            }
         }
     }
  }

  if (startIndex === -1) {
    return null; // Signal failure to caller
  }

  let endIndex = fullText.length;

  if (nextChapterTitle) {
    const nextPattern = createFlexiblePattern(nextChapterTitle);
    const nextRegex = new RegExp(nextPattern, 'i');
    
    // Search for next chapter after the current chapter starts
    const offset = startIndex + Math.min(chapterTitle.length, 50);
    const searchContext = fullText.slice(offset); 
    const nextMatch = nextRegex.exec(searchContext);
    
    if (nextMatch) {
      endIndex = offset + nextMatch.index;
    }
  }

  // Cap the length to avoid sending massive payloads if end detection fails
  // Increased to 1,000,000 chars (approx 250k tokens)
  const CHAR_LIMIT = 1000000; 
  let extracted = fullText.slice(startIndex, endIndex);
  
  if (extracted.length > CHAR_LIMIT) {
    extracted = extracted.slice(0, CHAR_LIMIT) + '... [Text truncated]';
  }

  return extracted.trim();
};