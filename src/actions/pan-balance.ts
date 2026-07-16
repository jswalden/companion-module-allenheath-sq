import type { Equal, Expect } from 'type-testing'
import type {
	CompanionActionDefinition,
	CompanionActionDefinitions,
	CompanionInputFieldDropdown,
	CompanionInputFieldNumber,
	CompanionOptionValues,
	DropdownChoice,
} from '@companion-module/base'
import { mixOrLROption } from './choices.js'
import type { sqInstance } from '../instance.js'
import {
	convertZeroIndexedLowercaseLROptionToOneIndexedUppercaseLROption,
	LR,
	LRStrip,
	type MixOrLR,
	tryUpgradeMixOrLROptionEncoding,
} from '../mixer/lr.js'
import type { Mixer } from '../mixer/mixer.js'
import type { Model } from '../mixer/model.js'
import { type NRPN, splitNRPN } from '../mixer/nrpn/nrpn.js'
import {
	BalanceNRPNCalculator,
	type SourceForSourceInMixAndLRForNRPN,
	type SourceSinkForNRPN,
} from '../mixer/nrpn/source-to-sink.js'
import { type PanBalance } from '../mixer/pan-balance.js'
import { toMixOrLR, toSourceOrSink } from './to-source-or-sink.js'
import type { OldCompanionMigrationAction as CompanionMigrationAction } from '../upgrades/types.js'
import { moveZeroIndexedOptionToOneIndexed } from '../upgrades/zero-indexed-to-one.js'
import type { ZeroIndexed } from '../utils/indexed.js'
import { repr } from '../utils/pretty.js'

const PanBalanceLevelOptionId = 'leveldb'

/**
 * Action IDs for all actions setting the pan/balance of a mixer source in a
 * mixer sink.
 */
export const PanBalanceActionId = {
	InputChannelPanBalanceInMixOrLR: 'chpan_to_mix',
	GroupPanBalanceInMixOrLR: 'grppan_to_mix',
	FXReturnPanBalanceInMixOrLR: 'fxrpan_to_mix',
	FXReturnPanBalanceInGroup: 'fxrpan_to_grp',
	MixOrLRPanBalanceInMatrix: 'mixpan_to_mtx',
	GroupPanBalanceInMatrix: 'grppan_to_mtx',
} as const

export type PanBalanceActionId = (typeof PanBalanceActionId)[keyof typeof PanBalanceActionId]

const PanBalanceSourceOptionId = 'source'
const PanBalanceSinkOptionId = 'sink'

export const ShowVarOptionId = 'showvar'

export type PanBalanceOptions = {
	[PanBalanceLevelOptionId]: PanBalanceChoice
	// Action callbacks don't ever use this, so as far as they're concerned it
	// likely can be omitted.  But learn functions, which return a string that
	// contains the variable name of the pan/balance variable for the selected
	// output signal, need to be able to return that string as option value, which
	// probably requires we specify this here.
	[ShowVarOptionId]: string
}

type PanBalanceSourceInMixOrLROptions = {
	[PanBalanceSourceOptionId]: number
	[PanBalanceSinkOptionId]: number | 'lr'
} & PanBalanceOptions

type PanBalanceMixOrLRInSinkOptions = {
	[PanBalanceSourceOptionId]: number | 'lr'
	[PanBalanceSinkOptionId]: number
} & PanBalanceOptions

type PanBalanceSourceInSinkOptions = {
	[PanBalanceSourceOptionId]: number
	[PanBalanceSinkOptionId]: number
} & PanBalanceOptions

/** Signal pan/balance adjustment in stereo sink actions. */
export type PanBalanceActions = {
	[PanBalanceActionId.InputChannelPanBalanceInMixOrLR]: {
		options: PanBalanceSourceInMixOrLROptions
	}
	[PanBalanceActionId.GroupPanBalanceInMixOrLR]: {
		options: PanBalanceSourceInMixOrLROptions
	}
	[PanBalanceActionId.FXReturnPanBalanceInMixOrLR]: {
		options: PanBalanceSourceInMixOrLROptions
	}
	[PanBalanceActionId.FXReturnPanBalanceInGroup]: {
		// This action reflected a onetime A&H MIDI API docs bug.  It's now been
		// gutted and takes only an `invalid` option corresponding to a
		// static-text "option".
		options: {
			invalid: string
		}
	}
	[PanBalanceActionId.MixOrLRPanBalanceInMatrix]: {
		options: PanBalanceMixOrLRInSinkOptions
	}
	[PanBalanceActionId.GroupPanBalanceInMatrix]: {
		options: PanBalanceSourceInSinkOptions
	}
}

type _AllOutputLevelActionsAccountedFor = Expect<Equal<keyof PanBalanceActions, PanBalanceActionId>>

const ObsoletePanBalanceSourceOptionId = 'input'
const ObsoletePanBalanceSinkOptionId = 'assign'

/**
 * The LR mix used to be identified using the number `99` in options.  This
 * function attempts to upgrade pan/balance actions (*only* pan/balance actions:
 * other action types are upgraded by similar functions in their action-defining
 * files) that identify the LR mix in this fashion to use the constant string
 * `'lr'`, i.e. `LR`.
 *
 * @param action
 *   An action to potentially upgrade.
 * @returns
 *   True iff the action was a pan/balance action containing an identification
 *   of the LR mix that was rewritten to use `'lr'`.
 */
export function tryUpgradePanBalanceMixOrLREncoding(action: CompanionMigrationAction): boolean {
	switch (action.actionId) {
		case PanBalanceActionId.InputChannelPanBalanceInMixOrLR:
		case PanBalanceActionId.GroupPanBalanceInMixOrLR:
		case PanBalanceActionId.FXReturnPanBalanceInMixOrLR:
			return tryUpgradeMixOrLROptionEncoding(action, ObsoletePanBalanceSinkOptionId)
		case PanBalanceActionId.MixOrLRPanBalanceInMatrix:
			return tryUpgradeMixOrLROptionEncoding(action, ObsoletePanBalanceSourceOptionId)
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
	[PanBalanceActionId.FXReturnPanBalanceInMixOrLR]: OnlySinkIsMixOrLR,
	[PanBalanceActionId.GroupPanBalanceInMatrix]: SourceAndSinkAreNotMixOrLR,
	[PanBalanceActionId.GroupPanBalanceInMixOrLR]: OnlySinkIsMixOrLR,
	[PanBalanceActionId.InputChannelPanBalanceInMixOrLR]: OnlySinkIsMixOrLR,
	[PanBalanceActionId.MixOrLRPanBalanceInMatrix]: OnlySourceIsMixOrLR,
} as const satisfies Record<Exclude<PanBalanceActionId, 'fxrpan_to_grp'>, SourceSinkInfo>

export function tryMakePanBalanceSourceSinkOptionsUserFriendly(action: CompanionMigrationAction): boolean {
	if (!Object.hasOwn(UserUnfriendlyOptionInfo, action.actionId)) {
		return false
	}

	const options = action.options
	if (!(ObsoletePanBalanceSourceOptionId in options)) {
		return false
	}

	const { sourceIsMixOrLR, sinkIsMixOrLR } =
		UserUnfriendlyOptionInfo[action.actionId as keyof typeof UserUnfriendlyOptionInfo]

	const convertSource = sourceIsMixOrLR
		? convertZeroIndexedLowercaseLROptionToOneIndexedUppercaseLROption
		: moveZeroIndexedOptionToOneIndexed
	convertSource(options, ObsoletePanBalanceSourceOptionId, PanBalanceSourceOptionId)

	const convertSink = sinkIsMixOrLR
		? convertZeroIndexedLowercaseLROptionToOneIndexedUppercaseLROption
		: moveZeroIndexedOptionToOneIndexed
	convertSink(options, ObsoletePanBalanceSinkOptionId, PanBalanceSinkOptionId)

	return true
}

/**
 * A dropdown option of the set of pan/balance level options for pan/balance
 * actions.
 */
export const PanLevelOption = {
	type: 'dropdown',
	label: 'Level',
	id: PanBalanceLevelOptionId,
	default: 'CTR',
	choices: ((): DropdownChoice[] => {
		const panLevels = []
		panLevels.push({ label: `Step Right`, id: 998 }, { label: `Step Left`, id: 999 })
		for (let i = -100; i <= 100; i += 5) {
			const pos = i < 0 ? `L${Math.abs(i)}` : i === 0 ? `CTR` : `R${i}`
			panLevels.push({ label: `${pos}`, id: `${pos}` })
		}

		return panLevels
	})(),
	minChoicesForSearch: 0,
} as const satisfies CompanionInputFieldDropdown<typeof PanBalanceLevelOptionId>

/** The set of pan/balance choice values offered for selection as pan levels. */
export type PanBalanceChoice = PanBalance | 998 | 999

/**
 *
 * @param instance
 *   The instance for which an action is being processed.
 * @param options
 *   The options supplied to the action.
 * @returns
 *   The pan/balance specified in options.
 */
export function getPanBalance(instance: sqInstance, options: CompanionOptionValues): PanBalanceChoice | null {
	const rawOptionVal = options[PanBalanceLevelOptionId]
	if (rawOptionVal === 998 || rawOptionVal === 999) {
		return rawOptionVal
	}

	// eslint-disable-next-line @typescript-eslint/no-base-to-string
	const optionVal = String(rawOptionVal)
	if (optionVal === 'CTR') {
		return 'CTR'
	}

	if (optionVal.length > 0) {
		const first = optionVal[0]
		if (first === 'L' || first === 'R') {
			const n = Number(optionVal.slice(1))
			if (n % 5 === 0 && 5 <= n && n <= 100) {
				return `${first}${n}`
			}
		}
	}

	instance.log('error', `Invalid pan/balance specified, aborting action: ${repr(rawOptionVal)}`)
	return null
}

function getBalanceSourceToMixOrLRNumbers(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	sourceType: SourceForSourceInMixAndLRForNRPN<'panBalance'>,
): [ZeroIndexed, MixOrLR] | null {
	const source = toSourceOrSink(instance, model, options[PanBalanceSourceOptionId], sourceType)
	if (source === null) {
		return null
	}

	const mixOrLR = toMixOrLR(instance, model, options[PanBalanceSinkOptionId])
	if (mixOrLR === null) {
		return null
	}

	return [source, mixOrLR]
}

function getBalanceSourceToSinkNumbers(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	sourceSink: SourceSinkForNRPN<'panBalance'>,
): [ZeroIndexed, ZeroIndexed] | null {
	const source = toSourceOrSink(instance, model, options[PanBalanceSourceOptionId], sourceSink[0])
	if (source === null) {
		return null
	}

	const sink = toSourceOrSink(instance, model, options[PanBalanceSinkOptionId], sourceSink[1])
	if (sink === null) {
		return null
	}

	return [source, sink]
}

function getBalanceSourceToMixOrLRParam(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	sourceType: SourceForSourceInMixAndLRForNRPN<'panBalance'>,
): NRPN<'panBalance'> | undefined {
	const sourceSink = getBalanceSourceToMixOrLRNumbers(instance, model, options, sourceType)
	if (sourceSink === null) {
		return undefined
	}

	const [source, mixOrLR] = sourceSink

	return mixOrLR === LR
		? BalanceNRPNCalculator.get(model, ['inputChannel', 'lr']).calculate(source, LRStrip)
		: BalanceNRPNCalculator.get(model, ['inputChannel', 'mix']).calculate(source, mixOrLR)
}

function getBalanceSourceToSinkParam(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	sourceSink: SourceSinkForNRPN<'panBalance'>,
): NRPN<'panBalance'> | undefined {
	const sourceSinkNums = getBalanceSourceToSinkNumbers(instance, model, options, sourceSink)
	if (sourceSinkNums === null) {
		return undefined
	}

	const [source, sink] = sourceSinkNums

	return BalanceNRPNCalculator.get(model, sourceSink).calculate(source, sink)
}

function panSourceToMixOrLRLearn(
	instance: sqInstance,
	model: Model,
	sourceType: SourceForSourceInMixAndLRForNRPN<'panBalance'>,
): NonNullable<CompanionActionDefinition['learn']> {
	return ({ options }): CompanionOptionValues | undefined => {
		const nrpn = getBalanceSourceToMixOrLRParam(instance, model, options, sourceType)
		if (nrpn === undefined) {
			return
		}

		const { MSB, LSB } = splitNRPN(nrpn)

		return {
			...options,
			showvar: `$(${instance.label}:pan_${MSB}.${LSB})`,
		}
	}
}

function panSourceToSinkLearn(
	instance: sqInstance,
	model: Model,
	sourceSink: SourceSinkForNRPN<'panBalance'>,
): NonNullable<CompanionActionDefinition['learn']> {
	return ({ options }): CompanionOptionValues | undefined => {
		const nrpn = getBalanceSourceToSinkParam(instance, model, options, sourceSink)
		if (nrpn === undefined) {
			return
		}

		const { MSB, LSB } = splitNRPN(nrpn)

		return {
			...options,
			showvar: `$(${instance.label}:pan_${MSB}.${LSB})`,
		}
	}
}

function panSourceToMixOrLRSubscribe(
	instance: sqInstance,
	mixer: Mixer,
	model: Model,
	sourceType: SourceForSourceInMixAndLRForNRPN<'panBalance'>,
): NonNullable<CompanionActionDefinition['subscribe']> {
	return async ({ options }) => {
		const nrpn = getBalanceSourceToMixOrLRParam(instance, model, options, sourceType)
		if (nrpn === undefined) {
			return
		}

		// Send a "get" so the pan/balance variable is defined.
		void mixer.sendCommands([mixer.getNRPNValue(nrpn)])
	}
}

function panSourceToSinkSubscribe(
	instance: sqInstance,
	mixer: Mixer,
	model: Model,
	sourceSink: SourceSinkForNRPN<'panBalance'>,
): NonNullable<CompanionActionDefinition['subscribe']> {
	return async ({ options }) => {
		const nrpn = getBalanceSourceToSinkParam(instance, model, options, sourceSink)
		if (nrpn === undefined) {
			return
		}

		// Send a "get" so the pan/balance variable is defined.
		void mixer.sendCommands([mixer.getNRPNValue(nrpn)])
	}
}

function panSourceToMixOrLRCallbackPrelude(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	sourceType: SourceForSourceInMixAndLRForNRPN<'panBalance'>,
): [ZeroIndexed, MixOrLR, PanBalanceChoice] | null {
	const sourceSink = getBalanceSourceToMixOrLRNumbers(instance, model, options, sourceType)
	if (sourceSink === null) {
		return null
	}

	const panBalance = getPanBalance(instance, options)
	if (panBalance === null) {
		return null
	}

	return [...sourceSink, panBalance]
}

function panSourceToSinkCallbackPrelude(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
	sourceSink: SourceSinkForNRPN<'panBalance'>,
): [ZeroIndexed, ZeroIndexed, PanBalanceChoice] | null {
	const sourceSinkNums = getBalanceSourceToSinkNumbers(instance, model, options, sourceSink)
	if (sourceSinkNums === null) {
		return null
	}

	const panBalance = getPanBalance(instance, options)
	if (panBalance === null) {
		return null
	}

	return [...sourceSinkNums, panBalance]
}

function panMixOrLRToMatrix(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
): [MixOrLR, ZeroIndexed] | null {
	const mixOrLR = toMixOrLR(instance, model, options[PanBalanceSourceOptionId])
	if (mixOrLR === null) {
		return null
	}

	const matrix = toSourceOrSink(instance, model, options[PanBalanceSinkOptionId], 'matrix')
	if (matrix === null) {
		return null
	}

	return [mixOrLR, matrix]
}

function getMixOrLRToMatrixParam(
	instance: sqInstance,
	model: Model,
	options: CompanionOptionValues,
): NRPN<'panBalance'> | null {
	const sourceSink = panMixOrLRToMatrix(instance, model, options)
	if (sourceSink === null) {
		return null
	}
	const [mixOrLR, matrix] = sourceSink

	return mixOrLR === LR
		? BalanceNRPNCalculator.get(model, ['lr', 'matrix']).calculate(LRStrip, matrix)
		: BalanceNRPNCalculator.get(model, ['mix', 'matrix']).calculate(mixOrLR, matrix)
}

function signalOption<Id extends CompanionInputFieldNumber['id']>(
	label: string,
	id: Id,
	counts: Model['inputOutputCounts'],
	type: 'inputChannel' | 'matrix' | 'group' | 'fxReturn',
): CompanionInputFieldNumber<Id> {
	return {
		type: 'number',
		label,
		id,
		default: 0,
		min: 0,
		max: counts[type] - 1,
	}
}

/**
 * Generate action definitions for adjusting the pan/balance of mixer sources
 * across mixer sinks.
 *
 * @param instance
 *   The instance for which actions are being generated.
 * @param mixer
 *   The mixer object to use when executing the actions.
 * @param mixesAndLR
 *   A choices list containing all numbered mixes plus the LR mix.
 * @returns
 *   The set of all pan/balance action definitions.
 */
export function panBalanceActions(
	instance: sqInstance,
	mixer: Mixer,
	mixesAndLR: DropdownChoice[],
): CompanionActionDefinitions<PanBalanceActions> {
	const model = mixer.model
	const counts = model.inputOutputCounts

	const ShowVarOption = {
		type: 'textinput',
		label: 'Instance variable containing pan/balance level (click Learn to refresh)',
		id: 'showvar',
		default: '',
	} as const

	const sourceNumber = (label: string, type: 'inputChannel' | 'group' | 'fxReturn') =>
		signalOption(label, PanBalanceSourceOptionId, counts, type)
	const sinkNumber = (label: string, type: 'matrix') => signalOption(label, PanBalanceSinkOptionId, counts, type)
	const mixNumberOrLRSource = (label: string) => mixOrLROption(label, PanBalanceSourceOptionId, mixesAndLR)
	const mixNumberOrLRSink = (label: string) => mixOrLROption(label, PanBalanceSinkOptionId, mixesAndLR)

	return {
		[PanBalanceActionId.InputChannelPanBalanceInMixOrLR]: {
			name: 'Pan/Bal channel level to mix',
			options: [sourceNumber('Input channel', 'inputChannel'), mixNumberOrLRSink('Mix'), PanLevelOption, ShowVarOption],
			learn: panSourceToMixOrLRLearn(instance, model, 'inputChannel'),
			subscribe: panSourceToMixOrLRSubscribe(instance, mixer, model, 'inputChannel'),
			callback: async ({ options }) => {
				const sourceSinkBalance = panSourceToMixOrLRCallbackPrelude(instance, model, options, 'inputChannel')
				if (sourceSinkBalance === null) {
					return
				}
				const [inputChannel, mixOrLR, panBalance] = sourceSinkBalance

				mixer.setInputChannelPanBalanceInMixOrLR(inputChannel, panBalance, mixOrLR)
			},
			optionsToMonitorForSubscribe: [PanBalanceSourceOptionId, PanBalanceSinkOptionId],
		},
		[PanBalanceActionId.GroupPanBalanceInMixOrLR]: {
			name: 'Pan/Bal group level to mix',
			options: [sourceNumber('Group', 'group'), mixNumberOrLRSink('Mix'), PanLevelOption, ShowVarOption],
			learn: panSourceToMixOrLRLearn(instance, model, 'group'),
			subscribe: panSourceToMixOrLRSubscribe(instance, mixer, model, 'group'),
			callback: async ({ options }) => {
				const sourceSinkBalance = panSourceToMixOrLRCallbackPrelude(instance, model, options, 'group')
				if (sourceSinkBalance === null) {
					return
				}
				const [group, mixOrLR, panBalance] = sourceSinkBalance

				mixer.setGroupPanBalanceInMixOrLR(group, panBalance, mixOrLR)
			},
			optionsToMonitorForSubscribe: [PanBalanceSourceOptionId, PanBalanceSinkOptionId],
		},
		[PanBalanceActionId.FXReturnPanBalanceInMixOrLR]: {
			name: 'Pan/Bal FX return level to mix',
			options: [sourceNumber('FX return', 'fxReturn'), mixNumberOrLRSink('Mix'), PanLevelOption, ShowVarOption],
			learn: panSourceToMixOrLRLearn(instance, model, 'fxReturn'),
			subscribe: panSourceToMixOrLRSubscribe(instance, mixer, model, 'fxReturn'),
			callback: async ({ options }) => {
				const sourceSinkBalance = panSourceToMixOrLRCallbackPrelude(instance, model, options, 'fxReturn')
				if (sourceSinkBalance === null) {
					return
				}
				const [fxReturn, mixOrLR, panBalance] = sourceSinkBalance

				mixer.setFXReturnPanBalanceInMixOrLR(fxReturn, panBalance, mixOrLR)
			},
			optionsToMonitorForSubscribe: [PanBalanceSourceOptionId, PanBalanceSinkOptionId],
		},
		[PanBalanceActionId.FXReturnPanBalanceInGroup]: {
			name: 'Pan/Bal FX return level to group',
			options: [
				{
					type: 'static-text',
					id: 'invalid',
					label: 'Invalid operation!',
					value: 'FX returns can only be assigned to groups, not have their pan/balance set in them.',
				},
			],
			callback: async () => {
				instance.log('warn', 'The "Pan/Bal FX return level to group" operation is invalid.  Don\'t use this action!')
			},
		},
		[PanBalanceActionId.MixOrLRPanBalanceInMatrix]: {
			name: 'Pan/Bal mix level to matrix',
			options: [mixNumberOrLRSource('Mix'), sinkNumber('Matrix', 'matrix'), PanLevelOption, ShowVarOption],
			learn: ({ options }, _context): CompanionOptionValues | undefined => {
				const nrpn = getMixOrLRToMatrixParam(instance, model, options)
				if (nrpn === null) {
					return undefined
				}
				const { MSB, LSB } = splitNRPN(nrpn)

				return {
					...options,
					showvar: `$(${instance.label}:pan_${MSB}.${LSB})`,
				}
			},
			subscribe: async ({ options }) => {
				const param = getMixOrLRToMatrixParam(instance, model, options)
				if (param === null) {
					return undefined
				}

				// Send a "get" so the pan/balance variable is defined.
				void mixer.sendCommands([mixer.getNRPNValue(param)])
			},
			callback: async ({ options }) => {
				const sourceSink = panMixOrLRToMatrix(instance, model, options)
				if (sourceSink === null) {
					return
				}
				const [mixOrLR, matrix] = sourceSink

				const panBalance = getPanBalance(instance, options)
				if (panBalance === null) {
					return
				}

				if (mixOrLR === LR) {
					mixer.setLRPanBalanceInMatrix(panBalance, matrix)
				} else {
					mixer.setMixPanBalanceInMatrix(mixOrLR, panBalance, matrix)
				}
			},
			optionsToMonitorForSubscribe: [PanBalanceSourceOptionId, PanBalanceSinkOptionId],
		},
		[PanBalanceActionId.GroupPanBalanceInMatrix]: {
			name: 'Pan/Bal group level to matrix',
			options: [sourceNumber('Group', 'group'), sinkNumber('Matrix', 'matrix'), PanLevelOption, ShowVarOption],
			learn: panSourceToSinkLearn(instance, model, ['group', 'matrix']),
			subscribe: panSourceToSinkSubscribe(instance, mixer, model, ['group', 'matrix']),
			callback: async ({ options }) => {
				const sourceSinkBalance = panSourceToSinkCallbackPrelude(instance, model, options, ['group', 'matrix'])
				if (sourceSinkBalance === null) {
					return
				}
				const [group, matrix, panBalance] = sourceSinkBalance

				mixer.setGroupPanBalanceInMatrix(group, panBalance, matrix)
			},
			optionsToMonitorForSubscribe: [PanBalanceSourceOptionId, PanBalanceSinkOptionId],
		},
	}
}
