import type { CompanionFeedbackDefinition } from '@companion-module/base'

export type CompanionFeedbackDefinitions<Feedbacks extends Record<string, object>> = Record<
	keyof Feedbacks,
	CompanionFeedbackDefinition
>
