/**
 * Analytics module for tracking comment approval/rejection metrics
 */
export class Analytics {
	constructor(kvNamespace) {
		this.kv = kvNamespace;
		this.analyticsPrefix = 'analytics:';
		this.dailyPrefix = 'daily:';
		this.actionPrefix = 'action:';
	}

	/**
	 * Track when a comment is sent for approval
	 */
	async trackCommentSentForApproval(postData, comment, pendingId) {
		const timestamp = new Date();
		const dateKey = this.getDateKey(timestamp);
		
		// Track individual action
		const actionKey = `${this.actionPrefix}sent:${pendingId}`;
		const actionData = {
			action: 'sent_for_approval',
			pendingId,
			postId: postData.id,
			subreddit: postData.subreddit,
			timestamp: timestamp.toISOString(),
			commentLength: comment.length
		};
		
		await this.kv.put(actionKey, JSON.stringify(actionData), {
			expirationTtl: 30 * 24 * 60 * 60 // 30 days
		});
		
		// Update daily metrics
		await this.incrementDailyMetric(dateKey, 'sent_for_approval');
		await this.incrementDailyMetric(dateKey, `sent_for_approval:${postData.subreddit}`);
		
		// Update hourly distribution
		const hour = timestamp.getHours();
		await this.incrementDailyMetric(dateKey, `hourly:${hour}:sent`);
	}

	/**
	 * Track comment approval
	 */
	async trackCommentApproved(pendingId, postData, comment) {
		const timestamp = new Date();
		const dateKey = this.getDateKey(timestamp);
		
		// Track individual action
		const actionKey = `${this.actionPrefix}approved:${pendingId}`;
		const actionData = {
			action: 'approved',
			pendingId,
			postId: postData.id,
			subreddit: postData.subreddit,
			timestamp: timestamp.toISOString(),
			commentLength: comment.length
		};
		
		await this.kv.put(actionKey, JSON.stringify(actionData), {
			expirationTtl: 30 * 24 * 60 * 60
		});
		
		// Update daily metrics
		await this.incrementDailyMetric(dateKey, 'approved');
		await this.incrementDailyMetric(dateKey, `approved:${postData.subreddit}`);
		
		// Track response time
		await this.trackResponseTime(pendingId, 'approved');
	}

	/**
	 * Track comment rejection with category
	 */
	async trackCommentRejected(pendingId, postData, comment, category = 'no_feedback') {
		const timestamp = new Date();
		const dateKey = this.getDateKey(timestamp);
		
		// Track individual action
		const actionKey = `${this.actionPrefix}rejected:${pendingId}`;
		const actionData = {
			action: 'rejected',
			pendingId,
			postId: postData.id,
			subreddit: postData.subreddit,
			timestamp: timestamp.toISOString(),
			category,
			commentLength: comment.length
		};
		
		await this.kv.put(actionKey, JSON.stringify(actionData), {
			expirationTtl: 30 * 24 * 60 * 60
		});
		
		// Update daily metrics
		await this.incrementDailyMetric(dateKey, 'rejected');
		await this.incrementDailyMetric(dateKey, `rejected:${category}`);
		await this.incrementDailyMetric(dateKey, `rejected:${postData.subreddit}`);
		
		// Track response time
		await this.trackResponseTime(pendingId, 'rejected');
	}

	/**
	 * Track comment edited
	 */
	async trackCommentEdited(pendingId, postData, oldComment, newComment) {
		const timestamp = new Date();
		const dateKey = this.getDateKey(timestamp);
		
		// Track individual action
		const actionKey = `${this.actionPrefix}edited:${pendingId}:${timestamp.getTime()}`;
		const actionData = {
			action: 'edited',
			pendingId,
			postId: postData.id,
			subreddit: postData.subreddit,
			timestamp: timestamp.toISOString(),
			oldLength: oldComment.length,
			newLength: newComment.length
		};
		
		await this.kv.put(actionKey, JSON.stringify(actionData), {
			expirationTtl: 30 * 24 * 60 * 60
		});
		
		// Update daily metrics
		await this.incrementDailyMetric(dateKey, 'edited');
		await this.incrementDailyMetric(dateKey, `edited:${postData.subreddit}`);
	}

	/**
	 * Track comment regenerated
	 */
	async trackCommentRegenerated(pendingId, postData, oldComment, newComment) {
		const timestamp = new Date();
		const dateKey = this.getDateKey(timestamp);
		
		// Track individual action
		const actionKey = `${this.actionPrefix}regenerated:${pendingId}:${timestamp.getTime()}`;
		const actionData = {
			action: 'regenerated',
			pendingId,
			postId: postData.id,
			subreddit: postData.subreddit,
			timestamp: timestamp.toISOString(),
			oldLength: oldComment.length,
			newLength: newComment.length
		};
		
		await this.kv.put(actionKey, JSON.stringify(actionData), {
			expirationTtl: 30 * 24 * 60 * 60
		});
		
		// Update daily metrics
		await this.incrementDailyMetric(dateKey, 'regenerated');
		await this.incrementDailyMetric(dateKey, `regenerated:${postData.subreddit}`);
	}

	/**
	 * Track response time for approval/rejection
	 */
	async trackResponseTime(pendingId, action) {
		// Find the original sent action
		const sentKey = `${this.actionPrefix}sent:${pendingId}`;
		const sentData = await this.kv.get(sentKey);
		
		if (sentData) {
			const sent = JSON.parse(sentData);
			const sentTime = new Date(sent.timestamp);
			const responseTime = Date.now() - sentTime.getTime();
			const responseMinutes = Math.floor(responseTime / (1000 * 60));
			
			const dateKey = this.getDateKey(new Date());
			
			// Store response time metrics
			const responseKey = `${this.analyticsPrefix}response_time:${dateKey}`;
			const existing = await this.kv.get(responseKey);
			const times = existing ? JSON.parse(existing) : { approved: [], rejected: [] };
			
			times[action].push(responseMinutes);
			
			await this.kv.put(responseKey, JSON.stringify(times), {
				expirationTtl: 30 * 24 * 60 * 60
			});
		}
	}

	/**
	 * Increment a daily metric
	 */
	async incrementDailyMetric(dateKey, metric) {
		const key = `${this.dailyPrefix}${dateKey}`;
		const existing = await this.kv.get(key);
		const data = existing ? JSON.parse(existing) : {};
		
		data[metric] = (data[metric] || 0) + 1;
		data.lastUpdated = new Date().toISOString();
		
		await this.kv.put(key, JSON.stringify(data), {
			expirationTtl: 90 * 24 * 60 * 60 // Keep for 90 days
		});
	}

	/**
	 * Get analytics for a date range
	 */
	async getAnalytics(startDate, endDate) {
		const analytics = {
			summary: {
				total_sent: 0,
				total_approved: 0,
				total_rejected: 0,
				total_edited: 0,
				total_regenerated: 0,
				approval_rate: 0,
				avg_response_time_minutes: 0
			},
			daily: {},
			by_subreddit: {},
			by_rejection_category: {},
			hourly_distribution: Array(24).fill(0),
			response_times: {
				approved: [],
				rejected: []
			}
		};
		
		// Iterate through each day in the range
		const current = new Date(startDate);
		const end = new Date(endDate);
		
		while (current <= end) {
			const dateKey = this.getDateKey(current);
			const dailyKey = `${this.dailyPrefix}${dateKey}`;
			const dailyData = await this.kv.get(dailyKey);
			
			if (dailyData) {
				const data = JSON.parse(dailyData);
				
				// Process daily data
				analytics.daily[dateKey] = {
					sent: data.sent_for_approval || 0,
					approved: data.approved || 0,
					rejected: data.rejected || 0,
					edited: data.edited || 0,
					regenerated: data.regenerated || 0,
					approval_rate: data.sent_for_approval > 0 
						? ((data.approved || 0) / data.sent_for_approval * 100).toFixed(1) 
						: 0
				};
				
				// Update summary
				analytics.summary.total_sent += data.sent_for_approval || 0;
				analytics.summary.total_approved += data.approved || 0;
				analytics.summary.total_rejected += data.rejected || 0;
				analytics.summary.total_edited += data.edited || 0;
				analytics.summary.total_regenerated += data.regenerated || 0;
				
				// Process subreddit data
				Object.keys(data).forEach(key => {
					if (key.startsWith('sent_for_approval:')) {
						const subreddit = key.split(':')[1];
						if (!analytics.by_subreddit[subreddit]) {
							analytics.by_subreddit[subreddit] = {
								sent: 0, approved: 0, rejected: 0, edited: 0, regenerated: 0
							};
						}
						analytics.by_subreddit[subreddit].sent += data[key];
					}
					// Similar processing for approved:, rejected:, etc.
				});
				
				// Process rejection categories
				Object.keys(data).forEach(key => {
					if (key.startsWith('rejected:') && !key.includes(':r/')) {
						const category = key.split(':')[1];
						analytics.by_rejection_category[category] = 
							(analytics.by_rejection_category[category] || 0) + data[key];
					}
				});
				
				// Process hourly distribution
				for (let hour = 0; hour < 24; hour++) {
					analytics.hourly_distribution[hour] += data[`hourly:${hour}:sent`] || 0;
				}
			}
			
			// Get response times for this day
			const responseKey = `${this.analyticsPrefix}response_time:${dateKey}`;
			const responseTimes = await this.kv.get(responseKey);
			if (responseTimes) {
				const times = JSON.parse(responseTimes);
				analytics.response_times.approved.push(...(times.approved || []));
				analytics.response_times.rejected.push(...(times.rejected || []));
			}
			
			current.setDate(current.getDate() + 1);
		}
		
		// Calculate final metrics
		if (analytics.summary.total_sent > 0) {
			analytics.summary.approval_rate = 
				(analytics.summary.total_approved / analytics.summary.total_sent * 100).toFixed(1);
		}
		
		// Calculate average response times
		const allResponseTimes = [
			...analytics.response_times.approved,
			...analytics.response_times.rejected
		];
		if (allResponseTimes.length > 0) {
			analytics.summary.avg_response_time_minutes = 
				(allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length).toFixed(1);
		}
		
		// Calculate subreddit approval rates
		Object.keys(analytics.by_subreddit).forEach(subreddit => {
			const data = analytics.by_subreddit[subreddit];
			data.approval_rate = data.sent > 0 
				? (data.approved / data.sent * 100).toFixed(1) 
				: 0;
		});
		
		return analytics;
	}

	/**
	 * Get analytics for the last N days
	 */
	async getRecentAnalytics(days = 7) {
		const endDate = new Date();
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days + 1);
		
		return this.getAnalytics(startDate, endDate);
	}

	/**
	 * Get date key in YYYY-MM-DD format
	 */
	getDateKey(date) {
		return date.toISOString().split('T')[0];
	}

	/**
	 * Clean up old analytics data
	 */
	async cleanup() {
		// This could be implemented to remove data older than 90 days
		// KV's TTL handles this automatically with expirationTtl
		console.log('Analytics cleanup - handled by KV TTL');
	}
}