import { type Model } from '../mixer/model.js'
import { type Mixer } from '../mixer/mixer.js'
import { SceneActionId, type ActionDefinitions } from './action-ids.js'
import { type SQInstanceInterface as sqInstance } from '../instance-interface.js'
import { type CompanionOptionValues } from '@companion-module/base'

function toScene(instance: sqInstance, model: Model, sceneOption: CompanionOptionValues['scene']): number | null {
	const scene = Number(sceneOption) - 1
	if (0 <= scene && scene < model.count.scene) {
		return scene
	}

	instance.log('error', `Attempting to recall invalid scene ${JSON.stringify(sceneOption)}, ignoring`)
	return null
}

const StepMin = -50
const StepMax = 50

function toSceneStep(instance: sqInstance, stepOption: CompanionOptionValues['scene']): number | null {
	const step = Number(stepOption)
	if (StepMin <= step && step <= StepMax) {
		return step
	}

	instance.log('error', `Attempting to step an invalid amount ${JSON.stringify(stepOption)}, ignoring`)
	return null
}

/**
 * Generate action definitions for modifying the mixer's current scene.
 *
 * @param instance
 *   The instance for which actions are being generated.
 * @param mixer
 *   The mixer object to use when executing the actions.
 * @returns
 *   The set of all scene action definitions.
 */
export function sceneActions(instance: sqInstance, mixer: Mixer): ActionDefinitions<SceneActionId> {
	const model = mixer.model

	return {
		[SceneActionId.SceneRecall]: {
			name: 'Scene recall',
			options: [
				{
					type: 'number',
					label: 'Scene nr.',
					id: 'scene',
					default: 1,
					min: 1,
					max: model.count.scene,
					required: true,
				},
			],
			callback: async ({ options }) => {
				const scene = toScene(instance, model, options.scene)
				if (scene === null) {
					return
				}
				mixer.setScene(scene)
			},
		},

		[SceneActionId.SceneStep]: {
			name: 'Scene step',
			options: [
				{
					type: 'number',
					label: 'Scene +/-',
					id: 'scene',
					default: 1,
					min: StepMin,
					max: StepMax,
					required: true,
				},
			],
			callback: async ({ options }) => {
				const adjust = toSceneStep(instance, options.scene)
				if (adjust === null) {
					return
				}
				mixer.stepSceneBy(adjust)
			},
		},
	}
}
