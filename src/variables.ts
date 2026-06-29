import type { Level } from './mixer/level.js'
import type { Model } from './mixer/model.js'
import { type NRPN, splitNRPN } from './mixer/nrpn/nrpn.js'
import { forEachOutputLevel } from './mixer/nrpn/output.js'
import { forEachSourceSinkNRPN } from './mixer/nrpn/source-to-sink.js'
import type { PanBalance } from './mixer/pan-balance.js'

/**
 * The variable ID for the variable containing the last recalled scene
 * (1-indexed).
 */
export const CurrentSceneId = 'currentScene'

/**
 * The variable ID for the variable updated every time a scene is recalled
 * intended for use in triggers.
 */
export const SceneRecalledTriggerId = 'sceneRecalledTrigger'

/**
 * All module variables.
 *
 * @allowunused
 */
export type SQVariables = {
	[SceneRecalledTriggerId]: number
	[CurrentSceneId]: number

	[level: `level_${number}.${number}`]: Level
	[panLevel: `pan_${number}.${number}`]: PanBalance
}

export type VariableDefinitions = Record<string, { name: string }>

export function getVariables(model: Model): VariableDefinitions {
	const variables: VariableDefinitions = {
		[SceneRecalledTriggerId]: {
			name: 'Scene - Scene Recalled Trigger',
		},
		[CurrentSceneId]: {
			name: 'Scene - Current',
		},
	}

	const addVariable = (nrpn: NRPN<'level'>, desc: string) => {
		const { MSB, LSB } = splitNRPN(nrpn)
		variables[`level_${MSB}.${LSB}`] = {
			name: desc,
		}
	}

	forEachSourceSinkNRPN(model, 'level', (nrpn, sourceDesc, sinkDesc) => {
		addVariable(nrpn, `${sourceDesc} -> ${sinkDesc} Level`)
	})

	forEachOutputLevel(model, (nrpn, outputDesc) => {
		addVariable(nrpn, `${outputDesc} Output Level`)
	})

	//mute input, LR, aux, group, matrix, dca, fx return, fx send, mute group

	return variables
}
