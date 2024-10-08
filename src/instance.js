// Allen & Heath SQ Series

import { InstanceBase, InstanceStatus } from '@companion-module/base'

import { GetConfigFields } from './config.js'
import { canUpdateOptionsWithoutRestarting, noConnectionOptions, optionsFromConfig } from './options.js'

import { getActions } from './actions/actions.js'
import { getFeedbacks } from './feedbacks/feedbacks.js'
import { getVariables } from './variables.js'
import { getPresets } from './presets.js'

import api from './api.js'

import { Choices } from './choices.js'
import { Mixer } from './mixer/mixer.js'

export class sqInstance extends InstanceBase {
	/** Options dictating the behavior of this instance. */
	options = noConnectionOptions()

	/** @type {Mixer | null} */
	mixer = null

	/**
	 * Construct an `sqInstance`.
	 *
	 * @param {ConstructorParameters<typeof InstanceBase<import('./config.js').SQInstanceConfig>>[0]} internal
	 */
	constructor(internal) {
		super(internal)

		// Assign the methods from the listed files to this class
		Object.assign(this, {
			...api,
		})
	}

	/** @type {import('@companion-module/base').InstanceBase<import('./config.js').SQInstanceConfig>['destroy']} */
	async destroy() {
		if (this.mixer !== null) {
			this.mixer.stop(InstanceStatus.Disconnected)
			this.mixer = null
		}
	}

	/** @type {import('@companion-module/base').InstanceBase<import('./config.js').SQInstanceConfig>['init']} */
	async init(config) {
		this.configUpdated(config)
	}

	/** @type {import('@companion-module/base').InstanceBase<import('./config.js').SQInstanceConfig>['getConfigFields']} */
	getConfigFields() {
		return GetConfigFields()
	}

	/**
	 * Set the value of a variable that doesn't exist when this instance is
	 * initialized, but only is brought into existence if/when it is needed.
	 *
	 * @param {import('@companion-module/base').CompanionVariableDefinition['variableId']} variableId
	 *   The id of the variable, i.e. the part that appears to right of the
	 *   colon in `$(SQ:ident)`.
	 * @param {import('@companion-module/base').CompanionVariableDefinition['name']} _name
	 *   A user-exposed description of the variable.
	 * @param {import('@companion-module/base').CompanionVariableValue} variableValue
	 *   The value of the variable.
	 */
	setExtraVariable(variableId, _name, variableValue) {
		// The name of this potentially newly-defined variable is currently not
		// used.  If we wanted to, we could redefine the entire variable set
		// (with this new variable included), to expose this new variable in
		// UI (for example, in variable autocomplete in text fields that support
		// variables).  But that's a large amount of churn for just a single
		// variable, with quadratically increasing cost (define N variables,
		// define N + 1 variables, define N + 2 variables...).  So for now we
		// use `disableVariableValidation` to add the variable without all that
		// extra support.  Perhaps Companion itself will grow an API to define
		// individual extra variables, and then we can use the name in that API.

		const { instanceOptions } = this
		const { disableVariableValidation: oldValue } = instanceOptions
		try {
			instanceOptions.disableVariableValidation = true

			this.setVariableValues({
				[variableId]: variableValue,
			})
		} finally {
			instanceOptions.disableVariableValidation = oldValue
		}
	}

	/**
	 * Set variable definitions for this instance.
	 *
	 * @param {import('./mixer/model.js').Model} model
	 */
	initVariableDefinitions(model) {
		this.setVariableDefinitions(getVariables(this, model))

		this.setVariableValues({
			// This value may very well be wrong, but there's no defined way to
			// query what the current scene is, nor to be updated if it changes
			// and this module didn't do it.
			currentScene: 1,
		})
	}

	/** @type {import('@companion-module/base').InstanceBase<import('./config.js').SQInstanceConfig>['configUpdated']} */
	async configUpdated(config) {
		const oldOptions = this.options

		const newOptions = optionsFromConfig(config)
		this.options = newOptions

		if (canUpdateOptionsWithoutRestarting(oldOptions, newOptions)) {
			return
		}

		this.mixer?.stop(InstanceStatus.Disconnected)

		const mixer = new Mixer(this, newOptions.model)
		this.mixer = mixer

		const model = mixer.model

		const choices = new Choices(model)

		this.initVariableDefinitions(model)
		this.setActionDefinitions(getActions(this, mixer, choices))
		this.setFeedbackDefinitions(getFeedbacks(mixer, choices))
		this.setPresetDefinitions(getPresets(this, model))

		//this.checkVariables();
		this.checkFeedbacks()

		const host = newOptions.host
		if (host === null) {
			mixer.stop(InstanceStatus.BadConfig)
		} else {
			mixer.start(host)
		}
	}
}
