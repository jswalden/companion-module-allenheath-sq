import type { Equal, Expect } from 'type-testing'
import type { CompanionBooleanFeedbackDefinition, CompanionFeedbackDefinitions } from '@companion-module/base'
import { faderNumber } from '../fader-number.js'
import { LRStrip } from '../mixer/lr.js'
import type { Mixer } from '../mixer/mixer.js'
import type { InputOutputType } from '../mixer/model.js'
import { calculateMuteNRPN } from '../mixer/nrpn/mute.js'
import { type OldCompanionMigrationFeedback as CompanionMigrationFeedback } from '../upgrades/types.js'
import { moveZeroIndexedOptionToOneIndexed } from '../upgrades/zero-indexed-to-one.js'
import { CarmineRed, White } from '../utils/colors.js'
import { zeroIndexedNumber } from '../utils/indexed.js'

/**
 * Feedback IDs for feedbacks reacting to the mute status of particular mixer
 * sources/sinks.
 */
export const MuteFeedbackId = {
	MuteInputChannel: 'mute_input',
	MuteLR: 'mute_lr',
	MuteMix: 'mute_aux',
	MuteGroup: 'mute_group',
	MuteMatrix: 'mute_matrix',
	MuteDCA: 'mute_dca',
	MuteFXReturn: 'mute_fx_return',
	MuteFXSend: 'mute_fx_send',
	MuteMuteGroup: 'mute_mutegroup',
} as const

export type MuteFeedbackId = (typeof MuteFeedbackId)[keyof typeof MuteFeedbackId]

const AllMuteWithStripFeedbacks: ReadonlySet<string> = new Set(
	Object.values(MuteFeedbackId).filter((feedbackId) => feedbackId !== 'mute_lr'),
)

const MuteFeedbackFaderOptionId = 'n'

type MuteNumberedSignalType = {
	options: {
		[MuteFeedbackFaderOptionId]: number
	}
	type: 'boolean'
}

/** Mute feedbacks. */
export type MuteFeedbacks = {
	[MuteFeedbackId.MuteLR]: {
		// There's only one LR signal, so no need for an option to identify it.
		options: Record<never, never>
		type: 'boolean'
	}
	[MuteFeedbackId.MuteInputChannel]: MuteNumberedSignalType
	[MuteFeedbackId.MuteMix]: MuteNumberedSignalType
	[MuteFeedbackId.MuteGroup]: MuteNumberedSignalType
	[MuteFeedbackId.MuteMatrix]: MuteNumberedSignalType
	[MuteFeedbackId.MuteDCA]: MuteNumberedSignalType
	[MuteFeedbackId.MuteFXReturn]: MuteNumberedSignalType
	[MuteFeedbackId.MuteFXSend]: MuteNumberedSignalType
	[MuteFeedbackId.MuteMuteGroup]: MuteNumberedSignalType
}

type _AllMuteFeedbacksAccountedFor = Expect<Equal<keyof MuteFeedbacks, MuteFeedbackId>>

const ObsoleteMuteFeedbackFaderOptionId = 'channel'

/**
 * Mute-LR feedbacks used to include a zero-indexed number identifying the LR
 * "channel" (i.e. always 0) being exposed.  Remove this option if it's present.
 */
export function tryRemoveChannelFromMuteLRFeedback(feedback: CompanionMigrationFeedback): boolean {
	if (feedback.feedbackId !== MuteFeedbackId.MuteLR) {
		return false
	}

	const options = feedback.options
	if (!(ObsoleteMuteFeedbackFaderOptionId in options)) {
		return false
	}

	delete options[ObsoleteMuteFeedbackFaderOptionId]

	return true
}

/**
 * Strip identification (e.g. input channel 3, mix 2, etc.) used to be done with
 * a zero-indexed number.  If the zero-indexed option is present, convert it to
 * a new one-indexed number option.
 */
export function tryMakeMuteFeedbackItemOneIndexed(feedback: CompanionMigrationFeedback): boolean {
	if (!AllMuteWithStripFeedbacks.has(feedback.feedbackId)) {
		return false
	}

	const options = feedback.options
	if (!(ObsoleteMuteFeedbackFaderOptionId in options)) {
		return false
	}

	moveZeroIndexedOptionToOneIndexed(options, ObsoleteMuteFeedbackFaderOptionId, MuteFeedbackFaderOptionId)

	return true
}

/** A map associating mutable input/output types to mute feedback IDs. */
export const typeToMuteFeedback = {
	inputChannel: MuteFeedbackId.MuteInputChannel,
	group: MuteFeedbackId.MuteGroup,
	mix: MuteFeedbackId.MuteMix,
	lr: MuteFeedbackId.MuteLR,
	muteGroup: MuteFeedbackId.MuteMuteGroup,
	matrix: MuteFeedbackId.MuteMatrix,
	fxReturn: MuteFeedbackId.MuteFXReturn,
	fxSend: MuteFeedbackId.MuteFXSend,
	dca: MuteFeedbackId.MuteDCA,
} as const satisfies Record<InputOutputType, MuteFeedbackId>

export function muteFeedbacks(mixer: Mixer): CompanionFeedbackDefinitions<MuteFeedbacks> {
	const counts = mixer.model.inputOutputCounts

	const faderOption = (label: string, type: Exclude<InputOutputType, 'lr'>) =>
		faderNumber(label, MuteFeedbackFaderOptionId, counts, type)

	function muteFeedback(
		label: string,
		type: InputOutputType,
	): CompanionBooleanFeedbackDefinition<MuteNumberedSignalType['options']> {
		return {
			type: 'boolean',
			name: `Mute ${label}`,
			description: 'Change colour',
			options: type === 'lr' ? [] : [faderOption(label, type)],
			defaultStyle: {
				color: White,
				bgcolor: CarmineRed,
			},
			callback: ({ options }, _context) => {
				const nrpn = calculateMuteNRPN(
					mixer.model,
					type,
					type === 'lr' ? LRStrip : zeroIndexedNumber(Number(options[MuteFeedbackFaderOptionId]) - 1),
				)
				return mixer.muted(nrpn)
			},
		}
	}

	return {
		[MuteFeedbackId.MuteLR]: muteFeedback('LR', 'lr'),
		[MuteFeedbackId.MuteInputChannel]: muteFeedback('Input', 'inputChannel'),
		[MuteFeedbackId.MuteMix]: muteFeedback('Aux', 'mix'),
		[MuteFeedbackId.MuteGroup]: muteFeedback('Group', 'group'),
		[MuteFeedbackId.MuteMatrix]: muteFeedback('Matrix', 'matrix'),
		[MuteFeedbackId.MuteDCA]: muteFeedback('DCA', 'dca'),
		[MuteFeedbackId.MuteFXReturn]: muteFeedback('FX Return', 'fxReturn'),
		[MuteFeedbackId.MuteFXSend]: muteFeedback('FX Send', 'fxSend'),
		[MuteFeedbackId.MuteMuteGroup]: muteFeedback('MuteGroup', 'muteGroup'),
	}
}
