import type { CompanionActionDefinitions } from '@companion-module/base'
import { type AssignActionId, type AssignActions, assignActions } from './assign.js'
import { Choices } from './choices.js'
import type { sqInstance } from '../instance.js'
import { type LevelActionId, type LevelActions, levelActions } from './level.js'
import { type Mixer } from '../mixer/mixer.js'
import { type MuteActionId, type MuteActions, muteActions } from './mute.js'
import { type OutputLevelActionId, type OutputLevelActions, outputLevelActions } from './output/level.js'
import {
	type OutputPanBalanceActionId,
	type OutputPanBalanceActions,
	outputPanBalanceActions,
} from './output/pan-balance.js'
import { type PanBalanceActionId, type PanBalanceActions, panBalanceActions } from './pan-balance.js'
import { type SceneActionId, type SceneActions, sceneActions } from './scene.js'
import { type SoftKeyActionId, type SoftKeyActions, softKeyActions } from './softkey.js'

/**
 * All action IDs.
 *
 * @allowunused
 */
export type ActionId =
	| MuteActionId
	| AssignActionId
	| SceneActionId
	| SoftKeyActionId
	| LevelActionId
	| PanBalanceActionId
	| OutputLevelActionId
	| OutputPanBalanceActionId

/** All mixer actions. */
export type SQActions = AssignActions &
	LevelActions &
	MuteActions &
	OutputLevelActions &
	OutputPanBalanceActions &
	PanBalanceActions &
	SceneActions &
	SoftKeyActions

/**
 * Get all action definitions exposed by this module.
 *
 * @param instance
 *   The instance for which definitions are being generated.
 * @param mixer
 *   The mixer in use by the instance.
 * @returns
 *   All actions defined by this module.
 */
export function getActions(instance: sqInstance, mixer: Mixer): CompanionActionDefinitions<SQActions> {
	const choices = new Choices(mixer.model)

	const mixesAndLR = choices.mixesAndLR

	return {
		...muteActions(instance, mixer),
		...(() => {
			const rotaryActions = {}
			if (mixer.model.rotaryKeys > 0) {
				// Soft Rotary
			} else {
				// No Soft Rotary
			}
			return rotaryActions
		})(),
		...softKeyActions(instance, mixer),
		...assignActions(instance, mixer, choices),
		...levelActions(instance, mixer, mixesAndLR),
		...panBalanceActions(instance, mixer, mixesAndLR),
		...outputLevelActions(instance, mixer),
		...outputPanBalanceActions(instance, mixer),
		...sceneActions(instance, mixer),
	}
}
