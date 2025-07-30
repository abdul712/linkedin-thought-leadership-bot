import { TelegramBot } from './telegram.js';

export class Monitoring {
  constructor(env) {
    this.env = env;
    this.telegram = new TelegramBot(env);
  }

  async checkHealth() {
    const issues = [];
    
    // Check API keys
    const apiKeyChecks = this.checkAPIKeys();
    issues.push(...apiKeyChecks);
    
    // Check Reddit credentials
    const redditChecks = this.checkRedditCredentials();
    issues.push(...redditChecks);
    
    // Check KV namespaces
    const kvChecks = await this.checkKVNamespaces();
    issues.push(...kvChecks);
    
    return issues;
  }

  checkAPIKeys() {
    const issues = [];
    const provider = this.env.AI_PROVIDER || 'anthropic';
    
    // Check primary AI provider
    switch (provider) {
      case 'anthropic':
        if (!this.env.ANTHROPIC_API_KEY) {
          issues.push({
            severity: 'error',
            title: 'Missing Anthropic API Key',
            message: 'The bot is configured to use Anthropic but ANTHROPIC_API_KEY is not set. Run: npx wrangler secret put ANTHROPIC_API_KEY'
          });
        }
        break;
      case 'openai':
        if (!this.env.OPENAI_API_KEY) {
          issues.push({
            severity: 'error',
            title: 'Missing OpenAI API Key',
            message: 'The bot is configured to use OpenAI but OPENAI_API_KEY is not set. Run: npx wrangler secret put OPENAI_API_KEY'
          });
        }
        break;
      case 'gemini':
        if (!this.env.GEMINI_API_KEY) {
          issues.push({
            severity: 'error',
            title: 'Missing Gemini API Key',
            message: 'The bot is configured to use Gemini but GEMINI_API_KEY is not set. Run: npx wrangler secret put GEMINI_API_KEY'
          });
        }
        break;
      case 'deepseek':
        if (!this.env.DEEPSEEK_API_KEY) {
          issues.push({
            severity: 'error',
            title: 'Missing Deepseek API Key',
            message: 'The bot is configured to use Deepseek but DEEPSEEK_API_KEY is not set. Run: npx wrangler secret put DEEPSEEK_API_KEY'
          });
        }
        break;
    }
    
    // Warn about missing fallback providers
    const providers = ['openai', 'anthropic', 'gemini', 'deepseek'];
    const availableProviders = [];
    
    if (this.env.OPENAI_API_KEY) availableProviders.push('openai');
    if (this.env.ANTHROPIC_API_KEY) availableProviders.push('anthropic');
    if (this.env.GEMINI_API_KEY) availableProviders.push('gemini');
    if (this.env.DEEPSEEK_API_KEY) availableProviders.push('deepseek');
    
    if (availableProviders.length === 0) {
      issues.push({
        severity: 'error',
        title: 'No AI Providers Available',
        message: 'No AI provider API keys are configured. The bot cannot generate comments.'
      });
    } else if (availableProviders.length === 1) {
      issues.push({
        severity: 'warning',
        title: 'No Fallback AI Providers',
        message: `Only ${availableProviders[0]} is configured. Consider adding another provider for redundancy.`
      });
    }
    
    return issues;
  }

  checkRedditCredentials() {
    const issues = [];
    
    if (!this.env.REDDIT_CLIENT_ID) {
      issues.push({
        severity: 'error',
        title: 'Missing Reddit Client ID',
        message: 'REDDIT_CLIENT_ID is not set. Run: npx wrangler secret put REDDIT_CLIENT_ID'
      });
    }
    
    if (!this.env.REDDIT_CLIENT_SECRET) {
      issues.push({
        severity: 'error',
        title: 'Missing Reddit Client Secret',
        message: 'REDDIT_CLIENT_SECRET is not set. Run: npx wrangler secret put REDDIT_CLIENT_SECRET'
      });
    }
    
    if (!this.env.REDDIT_USERNAME) {
      issues.push({
        severity: 'error',
        title: 'Missing Reddit Username',
        message: 'REDDIT_USERNAME is not set. Run: npx wrangler secret put REDDIT_USERNAME'
      });
    }
    
    if (!this.env.REDDIT_PASSWORD) {
      issues.push({
        severity: 'error',
        title: 'Missing Reddit Password',
        message: 'REDDIT_PASSWORD is not set. Run: npx wrangler secret put REDDIT_PASSWORD'
      });
    }
    
    return issues;
  }

  async checkKVNamespaces() {
    const issues = [];
    
    if (!this.env.COMMENT_HISTORY) {
      issues.push({
        severity: 'error',
        title: 'Missing KV Namespace',
        message: 'COMMENT_HISTORY KV namespace is not configured. Check wrangler.toml'
      });
    }
    
    return issues;
  }

  async sendHealthReport(issues) {
    if (issues.length === 0) {
      // Only send success message if explicitly requested
      return;
    }
    
    // Group by severity
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    
    if (errors.length > 0) {
      for (const error of errors) {
        await this.telegram.sendAlert(error.title, error.message, 'error');
      }
    }
    
    if (warnings.length > 0) {
      for (const warning of warnings) {
        await this.telegram.sendAlert(warning.title, warning.message, 'warning');
      }
    }
  }

  async checkDailyActivity(storage) {
    const todayComments = await storage.getTodayCommentCount();
    const minDailyComments = parseInt(this.env.MIN_DAILY_COMMENTS || '25');
    const now = new Date();
    const hour = now.getUTCHours();
    
    // Check at 20:00 UTC (3 PM EST) if minimum not met
    if (hour === 20 && todayComments < minDailyComments) {
      await this.telegram.sendAlert(
        'Low Daily Activity',
        `Only ${todayComments}/${minDailyComments} comments posted today. The bot should increase activity to meet the daily minimum.`,
        'warning'
      );
    }
    
    // Check for complete inactivity at noon UTC
    if (hour === 12 && todayComments === 0) {
      await this.telegram.sendAlert(
        'No Activity Today',
        'The bot has not posted any comments today. There may be an issue preventing normal operation.',
        'error'
      );
    }
  }

  async handleError(error, context) {
    // Send error notifications for critical failures
    const errorMessage = `Error in ${context}:\n${error.message}\n\nStack:\n${error.stack || 'No stack trace'}`;
    
    await this.telegram.sendAlert(
      `Bot Error: ${context}`,
      errorMessage,
      'error'
    );
  }
}