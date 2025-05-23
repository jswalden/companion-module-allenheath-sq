import type {
	CompanionInputFieldDropdown,
	CompanionMigrationAction,
	CompanionOptionValues,
} from '@companion-module/base'
import type { ActionDefinitions } from './actionid.js'
import type { Choices } from '../choices.js'
import { getFadeParameters } from './fading.js'
import type { sqInstance } from '../instance.js'
import { LR, tryUpgradeMixOrLRArrayEncoding, tryUpgradeMixOrLROptionEncoding } from '../mixer/lr.js'
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

/**
 * Action IDs for all actions that alter the level of a mixer source in a mixer
 * sink.
 */
export enum LevelActionId {
	InputChannelLevelInMixOrLR = 'chlev_to_mix',
	GroupLevelInMixOrLR = 'grplev_to_mix',
	FXReturnLevelInMixOrLR = 'fxrlev_to_mix',
	FXReturnLevelInGroup = 'fxrlev_to_grp',
	InputChannelLevelInFXSend = 'chlev_to_fxs',
	GroupLevelInFXSend = 'grplev_to_fxs',
	FXReturnLevelInFXSend = 'fxrlev_to_fxs',
	MixOrLRLevelInMatrix = 'mixlev_to_mtx',
	GroupLevelInMatrix = 'grplev_to_mtx',
}

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

const LevelSetSourceOptionId = 'input'
const LevelSetSinkOptionId = 'assign'

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
		case LevelActionId.InputChannelLevelInMixOrLR as string:
		case LevelActionId.GroupLevelInMixOrLR as string:
		case LevelActionId.FXReturnLevelInMixOrLR as string:
			return tryUpgradeMixOrLRArrayEncoding(action, LevelSetSinkOptionId)
		case LevelActionId.MixOrLRLevelInMatrix as string:
			return tryUpgradeMixOrLROptionEncoding(action, LevelSetSourceOptionId)
		default:
			return false
	}
}

type LevelType = {
	source: number
	sink: number
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
		source = src === LR ? 0 : src
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
		sink = snk === LR ? 0 : snk
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

	return {
		source,
		sink,
		sourceSinkType,
		nrpn: calc.calculate(source, sink),
	}
}

function sourceSinkOptions(
	sourceLabel: string,
	sourceChoices: keyof Choices,
	sinkLabel: string,
	sinkChoices: keyof Choices,
	choices: Choices,
): [CompanionInputFieldDropdown, CompanionInputFieldDropdown] {
	return [
		{
			type: 'dropdown',
			label: sourceLabel,
			id: LevelSetSourceOptionId,
			default: 0,
			choices: choices[sourceChoices],
			minChoicesForSearch: 0,
		},
		{
			type: 'dropdown',
			label: sinkLabel,
			id: LevelSetSinkOptionId,
			default: 0,
			choices: choices[sinkChoices],
			minChoicesForSearch: 0,
		},
	]
}

/**
 * Generate action definitions for setting the levels of sources in sinks: input
 * channels in mixes, mixes in LR, and so on and so forth.
 *
 * @param instance
 *   The instance for which actions are being generated.
 * @param mixer
 *   The mixer object to use when executing the actions.
 * @param choices
 *   Option choices for use in the actions.
 * @param levelOption
 *   An action option specifying all levels a source in a sink can be set to.
 * @param fadingOption
 *   An action option specifying various fade times over which the set to level
 *   should take place.
 * @returns
 *   The set of all level action definitions.
 */
export function levelActions(
	instance: sqInstance,
	mixer: Mixer,
	choices: Choices,
	levelOption: CompanionInputFieldDropdown,
	fadingOption: CompanionInputFieldDropdown,
): ActionDefinitions<LevelActionId> {
	const model = mixer.model

	return {
		[LevelActionId.InputChannelLevelInMixOrLR]: {
			name: 'Fader channel level to mix',
			options: [
				...sourceSinkOptions('Input channel', 'inputChannels', 'Mix', 'mixesAndLR', choices),
				levelOption,
				fadingOption,
			],
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
			options: [...sourceSinkOptions('Group', 'groups', 'Mix', 'mixesAndLR', choices), levelOption, fadingOption],
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
			options: [
				...sourceSinkOptions('FX return', 'fxReturns', 'Mix', 'mixesAndLR', choices),
				levelOption,
				fadingOption,
			],
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
				...sourceSinkOptions('Input channel', 'inputChannels', 'FX Send', 'fxSends', choices),
				levelOption,
				fadingOption,
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
			options: [...sourceSinkOptions('Group', 'groups', 'FX Send', 'fxSends', choices), levelOption, fadingOption],
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
			options: [
				...sourceSinkOptions('FX return', 'fxReturns', 'FX Send', 'fxSends', choices),
				levelOption,
				fadingOption,
			],
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
			options: [...sourceSinkOptions('Mix', 'mixesAndLR', 'Matrix', 'matrixes', choices), levelOption, fadingOption],
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
			options: [...sourceSinkOptions('Group', 'groups', 'Matrix', 'matrixes', choices), levelOption, fadingOption],
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
