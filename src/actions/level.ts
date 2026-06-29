import type { Equal, Expect } from 'type-testing'
import type {
	CompanionActionDefinition,
	CompanionInputFieldNumber,
	CompanionMigrationAction,
	CompanionOptionValues,
	DropdownChoice,
} from '@companion-module/base'
import { mixOrLROption } from './choices.js'
import {
	type FadeDuration,
	type FadeDurationOptionId,
	FadingOption,
	getFadeParameters,
	LevelOption,
	type SignalLevelChange,
	type SignalLevelOptionId,
} from './fading.js'
import type { sqInstance } from '../instance.js'
import {
	convertZeroIndexedLowercaseLROptionToOneIndexedUppercaseLROption,
	LR,
	LRStrip,
	tryUpgradeMixOrLRArrayEncoding,
	tryUpgradeMixOrLROptionEncoding,
} from '../mixer/lr.js'
import type { Mixer } from '../mixer/mixer.js'
import type { Model } from '../mixer/model.js'
import type { NRPN } from '../mixer/nrpn/nrpn.js'
import {
	LevelNRPNCalculator,
	type SinkForMixAndLRInSinkForNRPN,
	type SourceForSourceInMixAndLRForNRPN,
	type SourceSinkForNRPN,
} from '../mixer/nrpn/source-to-sink.js'
import { toMixOrLR, toSourceOrSink } from './to-source-or-sink.js'
import { moveZeroIndexedOptionToOneIndexed } from '../upgrades/zero-indexed-to-one.js'
import type { ZeroIndexed } from '../utils/indexed.js'

/**
 * Action IDs for all actions that alter the level of a mixer source in a mixer
 * sink.
 */
export const LevelActionId = {
	InputChannelLevelInMixOrLR: 'chlev_to_mix',
	GroupLevelInMixOrLR: 'grplev_to_mix',
	FXReturnLevelInMixOrLR: 'fxrlev_to_mix',
	FXReturnLevelInGroup: 'fxrlev_to_grp',
	InputChannelLevelInFXSend: 'chlev_to_fxs',
	GroupLevelInFXSend: 'grplev_to_fxs',
	FXReturnLevelInFXSend: 'fxrlev_to_fxs',
	MixOrLRLevelInMatrix: 'mixlev_to_mtx',
	GroupLevelInMatrix: 'grplev_to_mtx',
} as const

export type LevelActionId = (typeof LevelActionId)[keyof typeof LevelActionId]

type LevelAndFadeOptions = {
	[SignalLevelOptionId]: SignalLevelChange
	[FadeDurationOptionId]: FadeDuration
}

export const LevelSetSourceOptionId = 'source'
export const LevelSetSinkOptionId = 'sink'

type SourceLevelInMixOrLROptions = LevelAndFadeOptions & {
	[LevelSetSourceOptionId]: number
	[LevelSetSinkOptionId]: number | 'lr'
}

type SourceLevelInSinkOptions = LevelAndFadeOptions & {
	[LevelSetSourceOptionId]: number
	[LevelSetSinkOptionId]: number
}

type MixOrLRLevelInSinkOptions = LevelAndFadeOptions & {
	[LevelSetSourceOptionId]: number | 'lr'
	[LevelSetSinkOptionId]: number
}

/** Signal level adjustment actions. */
export type LevelActions = {
	[LevelActionId.InputChannelLevelInMixOrLR]: {
		options: SourceLevelInMixOrLROptions
	}
	[LevelActionId.GroupLevelInMixOrLR]: {
		options: SourceLevelInMixOrLROptions
	}
	[LevelActionId.FXReturnLevelInMixOrLR]: {
		options: SourceLevelInMixOrLROptions
	}
	[LevelActionId.FXReturnLevelInGroup]: {
		// This action reflected a onetime A&H MIDI API docs bug.  It's now been
		// gutted and takes only an `invalid` option corresponding to a
		// static-text "option".
		options: {
			invalid: string
		}
	}
	[LevelActionId.InputChannelLevelInFXSend]: {
		options: SourceLevelInSinkOptions
	}
	[LevelActionId.GroupLevelInFXSend]: {
		options: SourceLevelInSinkOptions
	}
	[LevelActionId.FXReturnLevelInFXSend]: {
		options: SourceLevelInSinkOptions
	}
	[LevelActionId.MixOrLRLevelInMatrix]: {
		options: MixOrLRLevelInSinkOptions
	}
	[LevelActionId.GroupLevelInMatrix]: {
		options: SourceLevelInMixOrLROptions
	}
}

type _AllLevelActionsAccountedFor = Expect<Equal<keyof LevelActions, LevelActionId>>

const ObsoleteFXReturnLevelinFXSendId = 'fxslev_to_fxs'

/**
 * The action id for setting the level of an FX return in an FX send used to
 * contain a typo: it claimed to be an "FX Send to FX Send" level.  Update the
 * id to fix the typo.
 *
 * @param action
 *   The action to potentially upgrade.
 * @returns
 *   True iff the action was an FX Return to FX Send level action and its action
 *   ID was corrected.
 */
export function tryFixFXRLevelInFXSIdTypo(action: CompanionMigrationAction): boolean {
	if (action.actionId !== ObsoleteFXReturnLevelinFXSendId) {
		return false
	}

	action.actionId = LevelActionId.FXReturnLevelInFXSend
	return true
}

const ObsoleteLevelSetSourceOptionId = 'input'
const ObsoleteLevelSetSinkOptionId = 'assign'

/**
 * The LR mix used to be identified using the number `99` in options.  This
 * function attempts to upgrade assign actions (*only* level actions: other
 * action types are upgraded by similar functions in their action-defining
 * files) that identify the LR mix in this fashion to use the constant string
 * `'lr'`, i.e. `LR`.
 *
 * @param action
 *   An action to potentially ugprade.
 * @returns
 *   True iff the action was a level action containing an identification of the
 *   LR mix that was rewritten to use `'lr'`.
 */
export function tryUpgradeLevelMixOrLREncoding(action: CompanionMigrationAction): boolean {
	switch (action.actionId) {
		case LevelActionId.InputChannelLevelInMixOrLR:
		case LevelActionId.GroupLevelInMixOrLR:
		case LevelActionId.FXReturnLevelInMixOrLR:
			return tryUpgradeMixOrLRArrayEncoding(action, ObsoleteLevelSetSinkOptionId)
		case LevelActionId.MixOrLRLevelInMatrix:
			return tryUpgradeMixOrLROptionEncoding(action, ObsoleteLevelSetSourceOptionId)
		default:
			return false
	}
}

type SourceSinkInfo = {
	sourceIsMixOrLR: boolean
	sinkIsMixOrLR: boolean
}

const OnlySourceIsMixOrLR = {
	sourceIsMixOrLR: true,
	sinkIsMixOrLR: false,
} as const satisfies SourceSinkInfo

const OnlySinkIsMixOrLR = {
	sourceIsMixOrLR: false,
	sinkIsMixOrLR: true,
} as const satisfies SourceSinkInfo

const SourceAndSinkAreNotMixOrLR = {
	sourceIsMixOrLR: false,
	sinkIsMixOrLR: false,
} as const satisfies SourceSinkInfo

const UserUnfriendlyOptionInfo = {
	[LevelActionId.InputChannelLevelInMixOrLR]: OnlySinkIsMixOrLR,
	[LevelActionId.GroupLevelInMixOrLR]: OnlySinkIsMixOrLR,
	[LevelActionId.FXReturnLevelInMixOrLR]: OnlySinkIsMixOrLR,
	[LevelActionId.InputChannelLevelInFXSend]: SourceAndSinkAreNotMixOrLR,
	[LevelActionId.GroupLevelInFXSend]: SourceAndSinkAreNotMixOrLR,
	[LevelActionId.FXReturnLevelInFXSend]: SourceAndSinkAreNotMixOrLR,
	[LevelActionId.GroupLevelInMatrix]: SourceAndSinkAreNotMixOrLR,
	[LevelActionId.MixOrLRLevelInMatrix]: OnlySourceIsMixOrLR,
	// FXR to Group is omitted because the action is obsolete and does nothing.
} as const satisfies Record<Exclude<LevelActionId, 'fxrlev_to_grp'>, SourceSinkInfo>

/**
 * Level-fading action source/sink options used to be zero-indexed numbers, or
 * `'lr'` for the LR mix.
 *
 * With the 2.0 module API and options being allowed to be defined with
 * expressions, these zero-indexed numbers ought be instead one-indexed to match
 * user expectations.  Additionally, `'lr'` as nicety ought be `'LR'` because
 * that's how it's referred to on the mixer surface.
 *
 * This function attempts to rewrite source/sink numbers to be one-indexed and
 * change `'lr'` to `'LR'`, returning true if rewriting succeeded.
 */
export function tryMakeLevelSourceSinkOptionsUserFriendly(action: CompanionMigrationAction): boolean {
	if (!Object.hasOwn(UserUnfriendlyOptionInfo, action.actionId)) {
		return false
	}

	const options = action.options
	if (!(ObsoleteLevelSetSourceOptionId in options)) {
		return false
	}

	const { sourceIsMixOrLR, sinkIsMixOrLR } =
		UserUnfriendlyOptionInfo[action.actionId as keyof typeof UserUnfriendlyOptionInfo]

	const convertSource = sourceIsMixOrLR
		? convertZeroIndexedLowercaseLROptionToOneIndexedUppercaseLROption
		: moveZeroIndexedOptionToOneIndexed
	convertSource(options, ObsoleteLevelSetSourceOptionId, LevelSetSourceOptionId)

	const convertSink = sinkIsMixOrLR
		? convertZeroIndexedLowercaseLROptionToOneIndexedUppercaseLROption
		: moveZeroIndexedOptionToOneIndexed
	convertSink(options, ObsoleteLevelSetSinkOptionId, LevelSetSinkOptionId)

	return true
}

type LevelType = {
	source: ZeroIndexed
	sink: ZeroIndexed
	sourceSinkType: SourceSinkForNRPN<'level'>
	nrpn: NRPN<'level'>
}

type SourceToMixOrLR = [SourceForSourceInMixAndLRForNRPN<'level'>, 'mix-or-lr']
type MixOrLRToSink = ['mix-or-lr', SinkForMixAndLRInSinkForNRPN<'level'>]

function getLevelType(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	srcSnkType: SourceSinkForNRPN<'level'>,
): LevelType | null
function getLevelType(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	srcSnkType: SourceToMixOrLR,
): LevelType | null
function getLevelType(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	srcSnkType: MixOrLRToSink,
): LevelType | null
function getLevelType(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	srcSnkType: SourceSinkForNRPN<'level'> | SourceToMixOrLR | MixOrLRToSink,
): LevelType | null {
	let sourceSinkType: SourceSinkForNRPN<'level'>
	let source, sink
	if (srcSnkType[0] === 'mix-or-lr') {
		const src = toMixOrLR(instance, model, options[LevelSetSourceOptionId])
		if (src === null) {
			return null
		}

		sink = toSourceOrSink(instance, model, options[LevelSetSinkOptionId], srcSnkType[1])
		if (sink === null) {
			return null
		}

		sourceSinkType = [src === LR ? 'lr' : 'mix', srcSnkType[1]]
		source = src === LR ? LRStrip : src
	} else if (srcSnkType[1] === 'mix-or-lr') {
		source = toSourceOrSink(instance, model, options[LevelSetSourceOptionId], srcSnkType[0])
		if (source === null) {
			return null
		}

		const snk = toMixOrLR(instance, model, options[LevelSetSinkOptionId])
		if (snk === null) {
			return null
		}

		sourceSinkType = [srcSnkType[0], snk === LR ? 'lr' : 'mix']
		sink = snk === LR ? LRStrip : snk
	} else {
		source = toSourceOrSink(instance, model, options[LevelSetSourceOptionId], srcSnkType[0])
		if (source === null) {
			return null
		}

		sink = toSourceOrSink(instance, model, options[LevelSetSinkOptionId], srcSnkType[1])
		if (sink === null) {
			return null
		}

		sourceSinkType = srcSnkType
	}

	const calc = LevelNRPNCalculator.get(model, sourceSinkType)

	type assert_SourceIsZeroIndexed = Expect<Equal<typeof source, ZeroIndexed>>
	type assert_SinkIsZeroIndexed = Expect<Equal<typeof sink, ZeroIndexed>>

	return {
		source,
		sink,
		sourceSinkType,
		nrpn: calc.calculate(source, sink),
	}
}

function signalOption<Id extends CompanionInputFieldNumber['id']>(
	label: string,
	id: Id,
	counts: Model['inputOutputCounts'],
	type: 'inputChannel' | 'group' | 'fxReturn' | 'fxSend' | 'matrix',
): CompanionInputFieldNumber {
	return {
		type: 'number',
		label,
		id,
		default: 1,
		min: 1,
		max: counts[type],
	}
}

/**
 * Generate action definitions for setting the levels of sources in sinks: input
 * channels in mixes, mixes in LR, and so on and so forth.
 *
 * @param instance
 *   The instance for which actions are being generated.
 * @param mixer
 *   The mixer object to use when executing the actions.
 * @param mixesAndLR
 *   A choices list containing all numbered mixes plus the LR mix.
 * @returns
 *   The set of all level action definitions.
 */
export function levelActions(
	instance: sqInstance,
	mixer: Mixer,
	mixesAndLR: DropdownChoice[],
): Record<LevelActionId, CompanionActionDefinition> {
	const model = mixer.model
	const counts = model.inputOutputCounts

	const sourceNumber = (label: string, type: 'inputChannel' | 'group' | 'fxReturn') =>
		signalOption(label, LevelSetSourceOptionId, counts, type)
	const sinkNumber = (label: string, type: 'group' | 'fxSend' | 'matrix') =>
		signalOption(label, LevelSetSinkOptionId, counts, type)
	const mixNumberOrLRSource = (label: string) => mixOrLROption(label, LevelSetSourceOptionId, mixesAndLR)
	const mixNumberOrLRSink = (label: string) => mixOrLROption(label, LevelSetSinkOptionId, mixesAndLR)

	return {
		[LevelActionId.InputChannelLevelInMixOrLR]: {
			name: 'Fader channel level to mix',
			options: [sourceNumber('Input channel', 'inputChannel'), mixNumberOrLRSink('Mix'), LevelOption, FadingOption],
			callback: async ({ options }) => {
				const levelType = getLevelType(instance, model, options, ['inputChannel', 'mix-or-lr'])
				if (levelType === null) {
					return
				}
				const {
					source: inputChannel,
					sink: mix,
					sourceSinkType: { 1: sinkType },
					nrpn,
				} = levelType

				const fade = getFadeParameters(instance, options, nrpn)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				if (sinkType === 'lr') {
					mixer.fadeInputChannelLevelInLR(inputChannel, start, end, fadeTimeMs)
				} else {
					mixer.fadeInputChannelLevelInMix(inputChannel, mix, start, end, fadeTimeMs)
				}
			},
		},
		[LevelActionId.GroupLevelInMixOrLR]: {
			name: 'Fader group level to mix',
			options: [sourceNumber('Group', 'group'), mixNumberOrLRSink('Mix'), LevelOption, FadingOption],
			callback: async ({ options }) => {
				const levelType = getLevelType(instance, model, options, ['group', 'mix-or-lr'])
				if (levelType === null) {
					return
				}
				const {
					source: group,
					sink: mix,
					sourceSinkType: { 1: sinkType },
					nrpn,
				} = levelType

				const fade = getFadeParameters(instance, options, nrpn)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				if (sinkType === 'lr') {
					mixer.fadeGroupLevelInLR(group, start, end, fadeTimeMs)
				} else {
					mixer.fadeGroupLevelInMix(group, mix, start, end, fadeTimeMs)
				}
			},
		},
		[LevelActionId.FXReturnLevelInMixOrLR]: {
			name: 'Fader FX return level to mix',
			options: [sourceNumber('FX return', 'fxReturn'), mixNumberOrLRSink('Mix'), LevelOption, FadingOption],
			callback: async ({ options }) => {
				const levelType = getLevelType(instance, model, options, ['fxReturn', 'mix-or-lr'])
				if (levelType === null) {
					return
				}
				const {
					source: fxReturn,
					sink: mix,
					sourceSinkType: { 1: sinkType },
					nrpn,
				} = levelType

				const fade = getFadeParameters(instance, options, nrpn)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				if (sinkType === 'lr') {
					mixer.fadeFXReturnLevelInLR(fxReturn, start, end, fadeTimeMs)
				} else {
					mixer.fadeFXReturnLevelInMix(fxReturn, mix, start, end, fadeTimeMs)
				}
			},
		},
		[LevelActionId.FXReturnLevelInGroup]: {
			name: 'Fader FX return level to group',
			options: [
				{
					type: 'static-text',
					id: 'invalid',
					label: 'Invalid operation!',
					value: 'FX returns can only be assigned to groups, not have their levels set in them.',
				},
			],
			callback: async () => {
				instance.log('warn', 'The "Fader FX return level to group" operation is invalid.  Don\'t use this action!')
			},
		},
		[LevelActionId.InputChannelLevelInFXSend]: {
			name: 'Fader channel level to FX send',
			options: [
				sourceNumber('Input channel', 'inputChannel'),
				sinkNumber('FX Send', 'fxSend'),
				LevelOption,
				FadingOption,
			],
			callback: async ({ options }) => {
				const levelType = getLevelType(instance, model, options, ['inputChannel', 'fxSend'])
				if (levelType === null) {
					return
				}
				const { source: inputChannel, sink: fxSend, nrpn } = levelType

				const fade = getFadeParameters(instance, options, nrpn)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				mixer.fadeInputChannelLevelInFXSend(inputChannel, fxSend, start, end, fadeTimeMs)
			},
		},
		[LevelActionId.GroupLevelInFXSend]: {
			name: 'Fader group level to FX send',
			options: [sourceNumber('Group', 'group'), sinkNumber('FX Send', 'fxSend'), LevelOption, FadingOption],
			callback: async ({ options }) => {
				const levelType = getLevelType(instance, model, options, ['group', 'fxSend'])
				if (levelType === null) {
					return
				}
				const { source: group, sink: fxSend, nrpn } = levelType

				const fade = getFadeParameters(instance, options, nrpn)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				mixer.fadeGroupLevelInFXSend(group, fxSend, start, end, fadeTimeMs)
			},
		},
		[LevelActionId.FXReturnLevelInFXSend]: {
			name: 'Fader FX return level to FX send',
			options: [sourceNumber('FX return', 'fxReturn'), sinkNumber('FX Send', 'fxSend'), LevelOption, FadingOption],
			callback: async ({ options }) => {
				const levelType = getLevelType(instance, model, options, ['fxReturn', 'fxSend'])
				if (levelType === null) {
					return
				}
				const { source: fxReturn, sink: fxSend, nrpn } = levelType

				const fade = getFadeParameters(instance, options, nrpn)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				mixer.fadeFXReturnLevelInFXSend(fxReturn, fxSend, start, end, fadeTimeMs)
			},
		},
		[LevelActionId.MixOrLRLevelInMatrix]: {
			name: 'Fader mix level to matrix',
			options: [mixNumberOrLRSource('Mix'), sinkNumber('Matrix', 'matrix'), LevelOption, FadingOption],
			callback: async ({ options }) => {
				const levelType = getLevelType(instance, model, options, ['mix-or-lr', 'matrix'])
				if (levelType === null) {
					return
				}
				const {
					source: mix,
					sourceSinkType: [sourceType],
					sink: matrix,
					nrpn,
				} = levelType

				const fade = getFadeParameters(instance, options, nrpn)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				if (sourceType === 'lr') {
					mixer.fadeLRLevelInMatrix(matrix, start, end, fadeTimeMs)
				} else {
					mixer.fadeMixLevelInMatrix(mix, matrix, start, end, fadeTimeMs)
				}
			},
		},
		[LevelActionId.GroupLevelInMatrix]: {
			name: 'Fader group level to matrix',
			options: [sourceNumber('Group', 'group'), sinkNumber('Matrix', 'matrix'), LevelOption, FadingOption],
			callback: async ({ options }) => {
				const levelType = getLevelType(instance, model, options, ['group', 'matrix'])
				if (levelType === null) {
					return
				}
				const { source: group, sink: matrix, nrpn } = levelType

				const fade = getFadeParameters(instance, options, nrpn)
				if (fade === null) {
					return
				}
				const { start, end, fadeTimeMs } = fade

				mixer.fadeGroupLevelInMatrix(group, matrix, start, end, fadeTimeMs)
			},
		},
	}
}
