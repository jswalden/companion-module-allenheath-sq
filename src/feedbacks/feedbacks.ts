import type { CompanionFeedbackDefinitions } from '@companion-module/base'
import type { Mixer } from '../mixer/mixer.js'
import { type MuteFeedbackId, type MuteFeedbacks, muteFeedbacks } from './mute.js'

/** All mixer feedbacks. */
export type SQFeedbacks = MuteFeedbacks

/**
 * All feedback IDs.
 *
 * @allowunused
 */
export type FeedbackId = MuteFeedbackId

export function getFeedbacks(mixer: Mixer): CompanionFeedbackDefinitions<SQFeedbacks> {
	return {
		...muteFeedbacks(mixer),
	}
}
