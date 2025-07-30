export class TelegramBot {
  constructor(env, analytics = null) {
    this.token = env.TELEGRAM_BOT_TOKEN;
    this.chatId = env.TELEGRAM_CHAT_ID;
    this.apiUrl = `https://api.telegram.org/bot${this.token}`;
    this.analytics = analytics;
  }

  async sendApprovalRequest(postData, comment, pendingId) {
    // Telegram has a 4096 character limit for messages
    const TELEGRAM_MESSAGE_LIMIT = 4096;
    const TRUNCATION_BUFFER = 200; // Reserve space for metadata and formatting
    
    // Calculate base message length without the comment
    const baseMessage = `🤖 *Reddit Comment Approval Request*\n\n` +
      `📝 *Subreddit:* r/${postData.subreddit}\n` +
      `👤 *Author:* u/${postData.author}\n` +
      `🔗 *Post:* [${this.escapeMarkdown(postData.title)}](https://reddit.com${postData.permalink})\n\n` +
      `💬 *Proposed Comment:*\n`;
    
    const footer = `\n\n🆔 *ID:* ${pendingId}`;
    const baseLength = baseMessage.length + footer.length + TRUNCATION_BUFFER;
    const maxCommentLength = TELEGRAM_MESSAGE_LIMIT - baseLength;
    
    // Truncate comment if necessary
    let displayComment = comment;
    let wasTruncated = false;
    if (comment.length > maxCommentLength) {
      displayComment = comment.substring(0, maxCommentLength - 50) + '...\n\n⚠️ *Comment truncated for display. Full version will be posted if approved.*';
      wasTruncated = true;
      console.log(`Comment truncated from ${comment.length} to ${displayComment.length} characters for Telegram display`);
    }
    
    const message = baseMessage + this.escapeMarkdown(displayComment) + footer;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `approve_${pendingId}` },
          { text: '❌ Reject', callback_data: `reject_${pendingId}` }
        ],
        [
          { text: '🔄 Regenerate', callback_data: `regenerate_${pendingId}` },
          { text: '✏️ Edit', callback_data: `edit_${pendingId}` }
        ]
      ]
    };

    try {
      // Try with Markdown first
      let response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
          disable_web_page_preview: false
        })
      });

      let result = await response.json();
      
      // If Markdown fails, try without formatting
      if (!result.ok && result.description && result.description.includes('parse entities')) {
        console.log('Markdown failed, sending plain text');
        const plainMessage = `🤖 Reddit Comment Approval Request\n\n` +
          `📝 Subreddit: r/${postData.subreddit}\n` +
          `👤 Author: u/${postData.author}\n` +
          `🔗 Post: ${postData.title}\n` +
          `Link: https://reddit.com${postData.permalink}\n\n` +
          `💬 Proposed Comment:\n${comment}\n\n` +
          `🆔 ID: ${pendingId}`;
        
        response = await fetch(`${this.apiUrl}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.chatId,
            text: plainMessage,
            reply_markup: keyboard,
            disable_web_page_preview: false
          })
        });
        
        result = await response.json();
      }
      
      if (!result.ok) {
        throw new Error(`Telegram API error: ${result.description}`);
      }
      
      return result.result.message_id;
    } catch (error) {
      console.error('Error sending Telegram message:', error);
      throw error;
    }
  }

  async updateMessage(messageId, newText, showKeyboard = false) {
    const params = {
      chat_id: this.chatId,
      message_id: messageId,
      text: newText,
      parse_mode: 'Markdown'
    };

    if (!showKeyboard) {
      params.reply_markup = { inline_keyboard: [] };
    }

    try {
      const response = await fetch(`${this.apiUrl}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      const result = await response.json();
      return result.ok;
    } catch (error) {
      console.error('Error updating Telegram message:', error);
      return false;
    }
  }

  async answerCallbackQuery(callbackQueryId, text) {
    try {
      const response = await fetch(`${this.apiUrl}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text,
          show_alert: false
        })
      });
      
      const result = await response.json();
      if (!result.ok) {
        console.error('Failed to answer callback query:', result);
      } else {
        console.log('Callback query answered successfully');
      }
      return result.ok;
    } catch (error) {
      console.error('Error answering callback query:', error);
      return false;
    }
  }

  async requestEditInput(pendingId, currentComment) {
    const message = `✏️ *Edit Comment*\n\n` +
      `Please reply to this message with your edited comment.\n\n` +
      `*Current comment:*\n${this.escapeMarkdown(currentComment)}\n\n` +
      `*Reply with:* edit_${pendingId} [your new comment]`;

    try {
      await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: 'Markdown'
        })
      });
    } catch (error) {
      console.error('Error requesting edit input:', error);
    }
  }

  async processWebhook(request, env) {
    try {
      const update = await request.json();
      console.log('Webhook received:', JSON.stringify(update));
      
      if (update.callback_query) {
        console.log('Processing callback query:', update.callback_query.data);
        await this.handleCallbackQuery(update.callback_query, env);
        return new Response('OK', { status: 200 });
      } else if (update.message && update.message.text) {
        console.log('Processing text message:', update.message.text);
        await this.handleTextMessage(update.message, env);
        return new Response('OK', { status: 200 });
      }
      
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Webhook error:', error);
      console.error('Error stack:', error.stack);
      return new Response('OK', { status: 200 }); // Always return OK to prevent Telegram retries
    }
  }

  async handleCallbackQuery(callbackQuery, env) {
    const { data, message, id: queryId } = callbackQuery;
    console.log(`Handling callback data: ${data}`);
    
    try {
      // Always answer the callback query first to prevent timeout
      const answered = await this.answerCallbackQuery(queryId, 'Processing...');
      if (!answered) {
        console.error('Failed to answer callback query');
      }
      
      // Handle different callback patterns
      if (data.startsWith('feedback_')) {
        // Format: feedback_pendingId_CATEGORY
        const parts = data.split('_');
        const pendingId = parts.slice(1, -1).join('_'); // Handle pendingId with underscores
        const category = parts[parts.length - 1];
        
        console.log(`Processing feedback: pendingId=${pendingId}, category=${category}`);
        
        const { Storage } = await import('./storage.js');
        const storage = new Storage(env.COMMENT_HISTORY);
        const pending = await storage.getPendingComment(pendingId);
        
        if (!pending) {
          console.error(`Pending comment not found: ${pendingId}`);
          await this.updateMessage(message.message_id, '❌ Comment not found or already processed.');
          return;
        }
        
        await this.handleFeedbackCategory(pending, message.message_id, data, env);
        return;
      }
    
      if (data.startsWith('reject_final_')) {
        // Handle "Just Reject (No Feedback)" option
        const pendingId = data.replace('reject_final_', '');
        
        const { Storage } = await import('./storage.js');
        const storage = new Storage(env.COMMENT_HISTORY);
        const pending = await storage.getPendingComment(pendingId);
        
        if (!pending) {
          await this.updateMessage(message.message_id, '❌ Comment not found or already processed.');
          return;
        }
        
        await this.handleFinalReject(pending, message.message_id, env);
        return;
      }
      
      // Original callback handling
      const [action, ...pendingIdParts] = data.split('_');
      const pendingId = pendingIdParts.join('_');
      
      console.log(`Handling callback: action=${action}, pendingId=${pendingId}`);

      const { Storage } = await import('./storage.js');
      const { Analytics } = await import('./analytics.js');
      const analytics = this.analytics || new Analytics(env.COMMENT_HISTORY);
      const storage = new Storage(env.COMMENT_HISTORY, analytics);
      const pending = await storage.getPendingComment(pendingId);
      
      if (!pending) {
        await this.updateMessage(message.message_id, '❌ Comment not found or already processed.');
        return;
      }

      switch (action) {
        case 'approve':
          console.log('Processing approve action');
          await this.handleApprove(pending, message.message_id, env);
          break;
        case 'reject':
          console.log('Processing reject action');
          await this.handleReject(pending, message.message_id, env);
          break;
        case 'regenerate':
          console.log('Processing regenerate action');
          await this.handleRegenerate(pending, message.message_id, env);
          break;
        case 'edit':
          console.log('Processing edit action');
          await this.requestEditInput(pendingId, pending.comment);
          await this.updateMessage(message.message_id, message.text + '\n\n⏳ *Status:* Waiting for edited comment...');
          break;
        default:
          console.error(`Unknown action: ${action}`);
      }
    } catch (error) {
      console.error('Error in handleCallbackQuery:', error);
      console.error('Error stack:', error.stack);
      
      // Try to update the message with an error
      try {
        await this.updateMessage(message.message_id, `❌ An error occurred while processing your request.\n\nError: ${error.message}`);
      } catch (updateError) {
        console.error('Failed to update message with error:', updateError);
      }
    }
  }

  async handleTextMessage(message, env) {
    const text = message.text.trim();
    
    if (text.startsWith('edit_')) {
      const match = text.match(/^edit_(\w+)\s+(.+)$/s);
      if (match) {
        const [, pendingId, newComment] = match;
        await this.handleEditSubmission(pendingId, newComment, env);
      }
    }
    
    return new Response('OK');
  }

  async handleApprove(pending, messageId, env) {
    try {
      console.log('Approving comment for post:', pending.postData.id);
      
      // Check if this is a test post
      if (pending.postData.id.startsWith('test_')) {
        console.log('Skipping Reddit API call for test post');
        
        const { Storage } = await import('./storage.js');
        const storage = new Storage(env.COMMENT_HISTORY);
        
        // Mark as commented even though it's a test
        await storage.markCommented(pending.postData.id, {
          subreddit: pending.postData.subreddit,
          title: pending.postData.title,
          comment: pending.comment,
          telegramApproved: true,
          isTest: true
        });
        
        // Delete from pending
        await storage.deletePendingComment(pending.id);
        
        await this.updateMessage(
          messageId,
          `✅ *Test Comment Approved!*`
        );
        return;
      }
      
      const { RedditClient } = await import('./reddit.js');
      const redditClient = new RedditClient(env);
      
      console.log('Posting comment to Reddit...');
      const response = await redditClient.postComment(
        pending.postData.id,
        pending.comment
      );
      console.log('Comment posted successfully');

      const { Storage } = await import('./storage.js');
      const { Analytics } = await import('./analytics.js');
      const analytics = this.analytics || new Analytics(env.COMMENT_HISTORY);
      const storage = new Storage(env.COMMENT_HISTORY, analytics);
      
      // Mark as commented
      await storage.markCommented(pending.postData.id, {
        subreddit: pending.postData.subreddit,
        title: pending.postData.title,
        comment: pending.comment,
        telegramApproved: true
      });
      
      // Delete from pending
      await storage.deletePendingComment(pending.id);
      
      // Track analytics
      if (analytics) {
        await analytics.trackCommentApproved(pending.id, pending.postData, pending.comment);
      }
      
      console.log('Comment approved and storage updated');

      await this.updateMessage(
        messageId,
        `✅ *Comment Approved and Posted!*`
      );
    } catch (error) {
      console.error('Error in handleApprove:', error);
      await this.updateMessage(
        messageId,
        `❌ *Error posting comment:*\n${error.message}\n\n` +
        `The comment has been kept in pending status.`
      );
    }
  }

  async handleReject(pending, messageId, env) {
    // Show feedback category selection
    const feedbackCategories = {
      'TOO_FORMAL': 'Sounds too formal/professional',
      'TOO_GENERIC': 'Too generic/vague',
      'AI_PHRASES': 'Contains obvious AI phrases',
      'UNNATURAL': 'Doesn\'t sound natural',
      'REPETITIVE': 'Similar to previous comments',
      'OFF_TOPIC': 'Doesn\'t match the context',
      'TOO_PERFECT': 'Grammar/spelling too perfect',
      'WRONG_TONE': 'Wrong tone for subreddit'
    };

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🏢 Too Formal', callback_data: `feedback_${pending.id}_TOO_FORMAL` },
          { text: '💭 Too Generic', callback_data: `feedback_${pending.id}_TOO_GENERIC` }
        ],
        [
          { text: '🤖 AI Phrases', callback_data: `feedback_${pending.id}_AI_PHRASES` },
          { text: '🗣️ Unnatural', callback_data: `feedback_${pending.id}_UNNATURAL` }
        ],
        [
          { text: '🔄 Repetitive', callback_data: `feedback_${pending.id}_REPETITIVE` },
          { text: '❌ Off Topic', callback_data: `feedback_${pending.id}_OFF_TOPIC` }
        ],
        [
          { text: '✨ Too Perfect', callback_data: `feedback_${pending.id}_TOO_PERFECT` },
          { text: '🎭 Wrong Tone', callback_data: `feedback_${pending.id}_WRONG_TONE` }
        ],
        [
          { text: '🚫 Just Reject (No Feedback)', callback_data: `reject_final_${pending.id}` }
        ]
      ]
    };

    try {
      await fetch(`${this.apiUrl}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          message_id: messageId,
          text: `❌ *Select Rejection Reason*\n\n` +
                `💬 *Comment:* ${this.escapeMarkdown(pending.comment)}\n\n` +
                `Please select why this comment sounds AI-generated:`,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        })
      });
    } catch (error) {
      console.error('Error showing feedback categories:', error);
      // Fallback to simple rejection
      await this.handleFinalReject(pending, messageId, env);
    }
  }

  async handleFeedbackCategory(pending, messageId, callbackData, env) {
    // Extract category from callback data: feedback_pendingId_CATEGORY
    const parts = callbackData.split('_');
    const category = parts[parts.length - 1];
    
    // Delete the pending comment first (ensure it's always deleted)
    const { Storage } = await import('./storage.js');
    const { Analytics } = await import('./analytics.js');
    const analytics = this.analytics || new Analytics(env.COMMENT_HISTORY);
    const storage = new Storage(env.COMMENT_HISTORY, analytics);
    
    try {
      await storage.deletePendingComment(pending.id);
      console.log(`Deleted pending comment: ${pending.id}`);
    } catch (deleteError) {
      console.error('Error deleting pending comment:', deleteError);
      // Continue even if deletion fails
    }
    
    try {
      // Store feedback
      const { FeedbackAnalyzer } = await import('./agents/feedbackAnalyzer.js');
      const feedbackAnalyzer = new FeedbackAnalyzer(env);
      
      await feedbackAnalyzer.storeFeedback({
        comment: pending.comment,
        postTitle: pending.postData.title,
        subreddit: pending.postData.subreddit,
        category: category,
        specificFeedback: 'Rejected via Telegram'
      });
      
      // Track analytics
      if (analytics) {
        await analytics.trackCommentRejected(pending.id, pending.postData, pending.comment, category);
      }

      // Update message with feedback confirmation
      const categoryNames = {
        'TOO_FORMAL': 'Too Formal/Professional',
        'TOO_GENERIC': 'Too Generic/Vague',
        'AI_PHRASES': 'Contains AI Phrases',
        'UNNATURAL': 'Sounds Unnatural',
        'REPETITIVE': 'Too Repetitive',
        'OFF_TOPIC': 'Off Topic',
        'TOO_PERFECT': 'Too Perfect Grammar',
        'WRONG_TONE': 'Wrong Tone for Subreddit'
      };

      await this.updateMessage(
        messageId,
        `❌ *Comment Rejected with Feedback*`
      );

    } catch (error) {
      console.error('Error storing feedback:', error);
      await this.updateMessage(
        messageId,
        `❌ *Comment Rejected*`
      );
    }
  }

  async handleFinalReject(pending, messageId, env) {
    const { Storage } = await import('./storage.js');
    const { Analytics } = await import('./analytics.js');
    const analytics = this.analytics || new Analytics(env.COMMENT_HISTORY);
    const storage = new Storage(env.COMMENT_HISTORY, analytics);
    
    try {
      await storage.deletePendingComment(pending.id);
      console.log(`Deleted pending comment: ${pending.id}`);
      
      // Track analytics
      if (analytics) {
        await analytics.trackCommentRejected(pending.id, pending.postData, pending.comment, 'no_feedback');
      }
      
      await this.updateMessage(
        messageId,
        `❌ *Comment Rejected*`
      );
    } catch (error) {
      console.error('Error in handleFinalReject:', error);
      await this.updateMessage(
        messageId,
        `❌ *Error Rejecting Comment*\n\n` +
        `${error.message}\n\n` +
        `Please try again or check the logs.`
      );
    }
  }

  async handleRegenerate(pending, messageId, env) {
    try {
      await this.updateMessage(
        messageId,
        `🔄 *Regenerating comment...*\n\nPlease wait while I generate a new comment.`
      );

      const { AIProviderManager } = await import('./ai-providers.js');
      const aiProvider = new AIProviderManager(env);
      const newComment = await aiProvider.generateComment(pending.postData);

      const { Storage } = await import('./storage.js');
      const { Analytics } = await import('./analytics.js');
      const analytics = this.analytics || new Analytics(env.COMMENT_HISTORY);
      const storage = new Storage(env.COMMENT_HISTORY, analytics);
      await storage.updatePendingComment(pending.id, { comment: newComment });
      
      // Track analytics
      if (analytics) {
        await analytics.trackCommentRegenerated(pending.id, pending.postData, pending.comment, newComment);
      }

      await this.sendApprovalRequest(pending.postData, newComment, pending.id);
      
      await this.updateMessage(
        messageId,
        `🔄 *Comment Regenerated*`
      );
    } catch (error) {
      await this.updateMessage(
        messageId,
        `❌ *Error regenerating comment:*\n${error.message}`
      );
    }
  }

  async handleEditSubmission(pendingId, newComment, env) {
    const { Storage } = await import('./storage.js');
    const { Analytics } = await import('./analytics.js');
    const analytics = this.analytics || new Analytics(env.COMMENT_HISTORY);
    const storage = new Storage(env.COMMENT_HISTORY, analytics);
    const pending = await storage.getPendingComment(pendingId);
    
    if (!pending) {
      await this.sendMessage(`❌ Comment with ID ${pendingId} not found.`);
      return;
    }

    await storage.updatePendingComment(pendingId, { comment: newComment });
    
    // Track analytics
    if (analytics) {
      await analytics.trackCommentEdited(pendingId, pending.postData, pending.comment, newComment);
    }
    
    await this.sendApprovalRequest(pending.postData, newComment, pendingId);
    await this.sendMessage(`✏️ Comment updated! A new approval request has been sent.`);
  }

  async sendMessage(text) {
    try {
      await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: text,
          parse_mode: 'Markdown'
        })
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  async sendAlert(title, message, severity = 'warning') {
    // Only send alerts if Telegram is configured
    if (!this.token || !this.chatId) {
      console.log('Telegram not configured, skipping alert:', title);
      return;
    }

    const severityEmojis = {
      error: '🚨',
      warning: '⚠️',
      info: 'ℹ️',
      success: '✅'
    };

    const emoji = severityEmojis[severity] || '📢';
    
    const alertText = `${emoji} *${this.escapeMarkdown(title)}*\n\n${this.escapeMarkdown(message)}\n\n🕐 _${new Date().toISOString()}_`;

    try {
      const response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: alertText,
          parse_mode: 'Markdown'
        })
      });

      const result = await response.json();
      if (!result.ok) {
        console.error('Failed to send alert:', result);
      }
    } catch (error) {
      console.error('Error sending alert:', error);
    }
  }

  escapeMarkdown(text) {
    if (!text) return '';
    // Escape special characters for Telegram MarkdownV2
    return text
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
      .replace(/\n/g, '\n');  // Preserve newlines
  }
}

export async function setupTelegramWebhook(env) {
  const webhookUrl = `${env.WORKER_URL}/telegram/webhook`;
  const telegram = new TelegramBot(env);
  
  try {
    const response = await fetch(`${telegram.apiUrl}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query']
      })
    });
    
    const result = await response.json();
    return result.ok;
  } catch (error) {
    console.error('Error setting up webhook:', error);
    return false;
  }
}