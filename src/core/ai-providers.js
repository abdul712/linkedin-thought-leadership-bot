export class AIProviderManager {
	constructor(env) {
		this.env = env;
		this.activeProvider = env.AI_PROVIDER || 'openai';
	}

	async generateComment(post) {
		const provider = this.getProvider();
		const prompt = this.buildPrompt(post);
		
		try {
			let comment = await provider.generate(prompt);
			
			// Post-generation cleanup and validation
			comment = this.cleanComment(comment);
			
			// Validate the comment
			if (!this.isValidComment(comment)) {
				console.error('Generated comment failed validation:', comment);
				return null;
			}
			
			return comment;
		} catch (error) {
			console.error(`AI generation failed with ${this.activeProvider}:`, error);
			return null;
		}
	}
	
	cleanComment(comment) {
		// First, handle various "or" separator patterns that indicate multiple options
		// This includes "Or", "or", "that", and various punctuation combinations
		const orPatterns = [
			/[\.\!\?]\s*Or\s+/,           // ". Or", "! Or", "? Or"
			/[\.\!\?]\s+or\s+/i,          // ". or", "! or", "? or" (case insensitive)
			/\s+Or\s+/,                   // " Or " anywhere in text
			/\s+or\s+(?=[A-Z])/,          // " or " followed by capital letter
			/[\.\!\?]\s*Alternatively,/i,  // ". Alternatively,"
			/[\.\!\?]\s*Option \d:/i,      // ". Option 1:", etc.
			/\n\s*Or\s+/,                 // "Or" at start of new line
			/\n\s*or\s+/i,                // "or" at start of new line
			/[\.\!\?]\s*That\s+(?:said|being said|noted),?/i,  // ". That said,", ". That being said,"
			/[\.\!\?]\s*On the other hand,?/i,  // ". On the other hand,"
			/[\.\!\?]\s*However,?/i,      // ". However," (when it introduces alternative)
			/[\.\!\?]\s*But\s+(?:then again|alternatively)/i,  // ". But then again", ". But alternatively"
			/\s+(?:or|and)\s+(?:maybe|perhaps|possibly)\s+/i,  // " or maybe ", " and perhaps "
			/[\.\!\?]\s*(?:Another|An alternative|A different)\s+(?:option|approach|way)/i,  // Alternative markers
		];
		
		// Check each pattern and truncate at the first match
		for (const pattern of orPatterns) {
			const match = comment.match(pattern);
			if (match) {
				// For punctuation patterns, keep the punctuation
				if (/^[\.\!\?]/.test(match[0])) {
					const punctuation = match[0].match(/[\.\!\?]/)[0];
					const endIndex = match.index + punctuation.length;
					comment = comment.substring(0, endIndex);
				} else {
					// For other patterns, cut at the match position
					comment = comment.substring(0, match.index).trim();
					
					// Ensure the comment ends properly if it doesn't already end with punctuation
					if (comment && !/[\.\!\?]$/.test(comment)) {
						// Look for the last complete sentence
						const lastSentenceMatch = comment.match(/.*[\.\!\?]/);
						if (lastSentenceMatch) {
							comment = lastSentenceMatch[0];
						} else {
							// If no sentence ending found, add a period
							comment = comment.replace(/,\s*$/, '') + '.';
						}
					}
				}
				break;
			}
		}
		
		// Remove any potential preambles or multiple options
		const lines = comment.split('\n').filter(line => line.trim());
		
		// If the comment starts with common preambles, remove them
		const preamblePatterns = [
			/^(here'?s? (a|the|my) comment|i would (say|comment)|option \d|comment):\s*/i,
			/^(here is|i think|maybe):\s*/i,  // Remove these phrases when followed by colon
			/^\d\.\s*/,  // Numbered options with space
			/^[-*]\s*/,  // Bullet points with space
			/^(1\)|2\)|a\)|b\))\s*/i,  // Parenthetical options like "1)" or "a)" with space
			/^:\s*/,  // Clean up any remaining colons at start
		];
		
		let cleanedComment = comment;
		if (lines.length > 0) {
			// Check if first line is a preamble
			let firstLineClean = lines[0];
			for (const pattern of preamblePatterns) {
				if (pattern.test(firstLineClean)) {
					// If it's a numbered/bulleted list, extract the content after the marker
					const match = firstLineClean.match(pattern);
					if (match && match[0]) {
						firstLineClean = firstLineClean.substring(match[0].length).trim();
						if (firstLineClean) {
							cleanedComment = firstLineClean + (lines.length > 1 ? '\n' + lines.slice(1).join('\n') : '');
						} else if (lines.length > 1) {
							cleanedComment = lines.slice(1).join('\n');
						}
					} else if (lines.length > 1) {
						cleanedComment = lines.slice(1).join('\n');
					}
					break;
				}
			}
		}
		
		// Final cleanup: if comment still contains numbered lists or obvious alternatives, take first sentence
		if (/^\d\.|\n\d\./.test(cleanedComment) || /^[a-z]\)|\n[a-z]\)/i.test(cleanedComment)) {
			// Find the first proper sentence ending
			const sentenceEnd = cleanedComment.match(/[\.\!\?](?:\s|$)/);
			if (sentenceEnd) {
				cleanedComment = cleanedComment.substring(0, sentenceEnd.index + 1);
			}
		}
		
		// Final check: ensure comment doesn't end with a comma
		cleanedComment = cleanedComment.trim();
		if (cleanedComment.endsWith(',')) {
			cleanedComment = cleanedComment.slice(0, -1).trim() + '.';
		}
		
		// Ensure comment ends with proper punctuation
		if (cleanedComment && !/[\.\!\?]$/.test(cleanedComment)) {
			cleanedComment += '.';
		}
		
		return cleanedComment;
	}
	
	isValidComment(comment) {
		if (!comment || comment.length < 10) return false;
		
		// List of forbidden words (profanity and overly casual/dismissive terms)
		const profanityList = [
			// Profanity
			'damn', 'dammit', 'damned', 'damnit', 'dayum', 'hell', 'helluva', 'crap', 'crappy', 
			'shit', 'shitty', 'shite', 'ass', 'asshole', 'arse', 'bastard', 'bitch', 'bitchy',
			'fuck', 'fucking', 'fucked', 'fck', 'fcking', 'fuk', 'piss', 'pissed', 'dick', 'cock', 
			'pussy', 'whore', 'slut', 'bloody', 'bugger', 'bollocks',
			// Overly casual/dismissive abbreviations
			'lol', 'lmao', 'lmfao', 'rofl', 'smh', 'fml', 'wtf', 'omg', 'omfg',
			'bruh', 'bro', 'nah', 'nope', 'yolo', 'yeet', 'fr', 'tbh', 'tbf',
			'ngl', 'imo', 'imho', 'fwiw', 'afaik', 'iirc', 'tldr', 'tl;dr',
			'rn', 'af', 'fam', 'sus', 'lit', 'lowkey', 'highkey', 'deadass'
		];
		
		const lowerComment = comment.toLowerCase();
		
		// Check for profanity
		for (const word of profanityList) {
			// Use word boundaries to avoid false positives (e.g., "class" containing "ass")
			const regex = new RegExp(`\\b${word}\\b`, 'i');
			if (regex.test(comment)) {
				console.error(`Comment contains forbidden word: ${word}`);
				return false;
			}
		}
		
		// Check if comment contains multiple options (shouldn't happen after cleaning)
		const multipleOptionPatterns = [
			/\b(option \d|or alternatively|another approach|you could also)\b/i,
			/\b(here are|following are|these are) (some |a few |)options\b/i,
			/[\.\!\?]\s+(Or|or)\s+[A-Za-z]/,  // Check for "Or" separator after punctuation
			/\s+(Or|or)\s+(?=[A-Z])/,         // " Or " or " or " followed by capital
			/^(1\.|2\.|a\)|b\)|1\)|2\))/i,   // Numbered/lettered lists at start
			/\n(1\.|2\.|a\)|b\)|1\)|2\))/i,  // Numbered/lettered lists on new line
			/\b(alternatively|instead|another way)\b/i,  // Alternative phrasing
			/\b(this or that|one or the other)\b/i,      // Direct "or" choices
		];
		
		for (const pattern of multipleOptionPatterns) {
			if (pattern.test(comment)) {  // Use original comment, not lowercase
				console.error('Comment appears to contain multiple options');
				return false;
			}
		}
		
		return true;
	}

	getProvider() {
		switch (this.activeProvider) {
			case 'openai':
				return new OpenAIProvider(this.env);
			case 'anthropic':
				return new AnthropicProvider(this.env);
			case 'gemini':
				return new GeminiProvider(this.env);
			case 'deepseek':
				return new DeepseekProvider(this.env);
			default:
				return new OpenAIProvider(this.env);
		}
	}

	buildPrompt(post) {
		return `Write a brief Reddit comment (1-3 sentences) for this post.

Post Title: ${post.title}
Post Content: ${post.selftext || 'No text content'}
Subreddit: r/${post.subreddit}

WRITE LIKE A REAL PERSON:
- Keep it SHORT - just 1-3 sentences max
- Be casual and conversational
- Sound like you're actually interested
- React naturally to what they're saying
- Share a quick thought or experience if relevant
- Don't try to solve everything

EXAMPLES OF GOOD COMMENTS:
- "I had the same issue last week. Turned out my config file was in the wrong directory."
- "That's rough. Have you tried checking if the service is actually running?"
- "Been there. The documentation for that library is pretty confusing."
- "Nice find! I've been looking for something like this."
- "Yeah the learning curve is steep but it gets easier after the first project."

AVOID:
- Long explanations or lectures
- Perfect grammar (occasional contractions are fine)
- Listing multiple steps or options
- Formal language or technical jargon
- Any swearing or inappropriate language
- Internet slang (lol, lmao, tbh, etc)
- Being overly helpful or eager

Write ONE short comment:`;
	}
}

class OpenAIProvider {
	constructor(env) {
		this.apiKey = env.OPENAI_API_KEY;
		this.model = env.OPENAI_MODEL || 'gpt-3.5-turbo';
	}

	async generate(prompt) {
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.model,
				messages: [
					{
						role: 'system',
						content: 'You are a regular Reddit user. Write SHORT comments (1-3 sentences). Be casual and conversational. Sound genuinely interested but not overly helpful. Never use profanity or internet slang. Just write one brief, natural comment.'
					},
					{
						role: 'user',
						content: prompt
					}
				],
				temperature: 0.8 + (Math.random() * 0.3 - 0.15), // Vary between 0.65 and 0.95 for more natural variation
				max_tokens: 60 + Math.floor(Math.random() * 40) // Vary between 60-100 tokens for shorter comments
			})
		});

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.status}`);
		}

		const data = await response.json();
		return data.choices[0].message.content.trim();
	}
}

class AnthropicProvider {
	constructor(env) {
		this.apiKey = env.ANTHROPIC_API_KEY;
		this.model = env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
	}

	async generate(prompt) {
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'x-api-key': this.apiKey,
				'anthropic-version': '2023-06-01',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.model,
				system: 'You are a regular Reddit user. Write SHORT comments (1-3 sentences). Be casual and conversational. Sound genuinely interested but not overly helpful. Never use profanity or internet slang. Just write one brief, natural comment.',
				messages: [
					{
						role: 'user',
						content: prompt
					}
				],
				max_tokens: 80,
				temperature: 0.85
			})
		});

		if (!response.ok) {
			throw new Error(`Anthropic API error: ${response.status}`);
		}

		const data = await response.json();
		return data.content[0].text.trim();
	}
}

class GeminiProvider {
	constructor(env) {
		this.apiKey = env.GEMINI_API_KEY;
		this.model = env.GEMINI_MODEL || 'gemini-pro';
	}

	async generate(prompt) {
		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				contents: [{
					parts: [{
						text: prompt
					}]
				}],
				generationConfig: {
					temperature: 0.85,
					maxOutputTokens: 80
				}
			})
		});

		if (!response.ok) {
			throw new Error(`Gemini API error: ${response.status}`);
		}

		const data = await response.json();
		return data.candidates[0].content.parts[0].text.trim();
	}
}

class DeepseekProvider {
	constructor(env) {
		this.apiKey = env.DEEPSEEK_API_KEY;
		this.model = env.DEEPSEEK_MODEL || 'deepseek-chat';
		this.baseUrl = 'https://api.deepseek.com/v1/chat/completions';
	}

	async generate(prompt) {
		const response = await fetch(this.baseUrl, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.model,
				messages: [
					{
						role: 'system',
						content: 'You are a regular Reddit user. Write SHORT comments (1-3 sentences). Be casual and conversational. Sound genuinely interested but not overly helpful. Never use profanity or internet slang. Just write one brief, natural comment.'
					},
					{
						role: 'user',
						content: prompt
					}
				],
				temperature: 0.8 + (Math.random() * 0.3 - 0.15), // Vary between 0.65 and 0.95 for more natural variation
				max_tokens: 60 + Math.floor(Math.random() * 40) // Vary between 60-100 tokens for shorter comments
			})
		});

		if (!response.ok) {
			throw new Error(`Deepseek API error: ${response.status}`);
		}

		const data = await response.json();
		return data.choices[0].message.content.trim();
	}
}