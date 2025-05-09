import { getOutputCalculator, type InputOutputType, type Model } from '../model.js'
import { calculateNRPN, type NRPN, toNRPN, type NRPNType, type Param, type UnbrandedParam } from './nrpn.js'

type OutputInfo = {
	/** The base MSB/LSB for adjusting output level. */
	readonly level: UnbrandedParam

	/**
	 * The base MSB/LSB for adjusting output balance.  Only stereo
	 * outputs define this; mono outputs omit it.
	 */
	readonly panBalance?: UnbrandedParam
}

/**
 * The type of all NRPNs that apply to at least one mixer sink being used as an
 * output.
 */
export type OutputNRPN = keyof Required<OutputInfo>

type OutputParametersType = Partial<Readonly<Record<InputOutputType, Readonly<OutputInfo>>>>

/**
 * Base parameter MSB/LSB values for mixer sinks set as mixer outputs.  Note
 * that LR is considered to be a special category, distinct from mixes, that
 * consists of only the single LR mix.
 *
 * These values are the pairs in the columns of the relevant tables in the
 * [SQ MIDI Protocol document](https://www.allen-heath.com/content/uploads/2023/11/SQ-MIDI-Protocol-Issue5.pdf).
 */
const OutputParameterBaseRaw = {
	lr: {
		level: { MSB: 0x4f, LSB: 0x00 },
		panBalance: { MSB: 0x5f, LSB: 0x00 },
	},
	mix: {
		level: { MSB: 0x4f, LSB: 0x01 },
		panBalance: { MSB: 0x5f, LSB: 0x01 },
	},
	// XXX Note that with 1.6.* firmware, if any matrixes have been split into
	//     two mono matrixes, this likely mishandles stuff, as the first 1.6.*
	//     release explicitly doesn't provide MIDI control of mono matrixes, and
	//     this might affect stereo matrixes as well.
	matrix: {
		level: { MSB: 0x4f, LSB: 0x11 },
		panBalance: { MSB: 0x5f, LSB: 0x11 },
	},
	fxSend: {
		level: { MSB: 0x4f, LSB: 0x0d },
	},
	dca: {
		level: { MSB: 0x4f, LSB: 0x20 },
	},
} as const satisfies OutputParametersType

type ApplyOutputBranding<T extends OutputParametersType> = {
	[Sink in keyof T]: T[Sink] extends OutputInfo
		? {
				[NRPN in keyof T[Sink]]: T[Sink][NRPN] extends UnbrandedParam
					? NRPN extends NRPNType
						? Param<NRPN>
						: never
					: never
			}
		: T[Sink] extends undefined
			? Sink | undefined
			: never
}

const OutputParameterBase = OutputParameterBaseRaw as ApplyOutputBranding<typeof OutputParameterBaseRaw>

type OutputParameterBaseType = typeof OutputParameterBase

type OutputSinkMatchesNRPN<
	Sink extends keyof OutputParameterBaseType,
	NRPN extends OutputNRPN,
> = Sink extends keyof OutputParameterBaseType
	? [NRPN] extends [keyof OutputParameterBaseType[Sink]]
		? [Sink, NRPN]
		: never
	: never

/** Enumerate all `Sink` usable as output supporting the given NRPN. */
export type SinkAsOutputForNRPN<NRPN extends OutputNRPN> = OutputSinkMatchesNRPN<keyof OutputParameterBaseType, NRPN>[0]

class OutputNRPNCalculator<T extends OutputNRPN> {
	readonly #inputOutputCounts
	readonly #sinkType: SinkAsOutputForNRPN<T>
	readonly #base: Param<T>

	constructor(model: Model, nrpnType: T, sinkType: SinkAsOutputForNRPN<T>) {
		this.#inputOutputCounts = model.inputOutputCounts
		this.#sinkType = sinkType

		// TypeScript doesn't preserve awareness of the validity of the property
		// walk described by `sinkType` and `nrpnType` after
		// `OutputSinkMatchesNRPN` does its thing.  Do enough casting to make
		// the property access sequence type-check.
		const info = OutputParameterBase[sinkType] as Required<OutputInfo>
		this.#base = info[nrpnType] as Param<T>
	}

	calculate(sink: number): NRPN<T> {
		if (this.#inputOutputCounts[this.#sinkType] <= sink) {
			throw new Error(`${this.#sinkType}=${sink} is invalid`)
		}

		return calculateNRPN(toNRPN(this.#base), sink)
	}
}

export class OutputLevelNRPNCalculator extends OutputNRPNCalculator<'level'> {
	constructor(model: Model, sinkType: SinkAsOutputForNRPN<'level'>) {
		super(model, 'level', sinkType)
	}

	static get(model: Model, sinkType: SinkAsOutputForNRPN<'level'>): OutputLevelNRPNCalculator {
		return getOutputCalculator(model, 'level', sinkType, OutputLevelNRPNCalculator)
	}
}

export class OutputBalanceNRPNCalculator extends OutputNRPNCalculator<'panBalance'> {
	constructor(model: Model, sinkType: SinkAsOutputForNRPN<'panBalance'>) {
		super(model, 'panBalance', sinkType)
	}

	static get(model: Model, sinkType: SinkAsOutputForNRPN<'panBalance'>): OutputBalanceNRPNCalculator {
		return getOutputCalculator(model, 'panBalance', sinkType, OutputBalanceNRPNCalculator)
	}
}

export type OutputCalculatorForNRPN<NRPN extends OutputNRPN> = NRPN extends 'level'
	? typeof OutputLevelNRPNCalculator
	: NRPN extends 'panBalance'
		? typeof OutputBalanceNRPNCalculator
		: never

export type SinkToCalculator<NRPN extends OutputNRPN> = Record<
	SinkAsOutputForNRPN<NRPN>,
	InstanceType<OutputCalculatorForNRPN<NRPN>> | null
>

export type OutputCalculatorCache = {
	readonly [NRPN in OutputNRPN]: SinkToCalculator<NRPN>
}

/**
 * The functor type passed to `forEachOutputLevel`.  Each invocation will be
 * for a particular output level, e.g. a mix, or LR, or an FX send, etc.  The
 * functor will be invoked with the NRPN pair for the level and a readable
 * description of the particular output.
 */
type OutputLevelFunctor = (nrpn: NRPN<'level'>, outputDesc: string) => void

/**
 * For each sink usable as output with adjustable level, invoke the given
 * function.
 *
 * @param model
 *   The SQ mixer model.
 * @param f
 *   The function to invoke.  For each category of output with a level, this
 *   function is called once for each output within that category.  For example,
 *   given that there's a mix category of output and supposing a mixer model
 *   with twelve mixes, the function is invoked 12 times for their possible
 *   level NRPNs.
 */
export function forEachOutputLevel(model: Model, f: OutputLevelFunctor): void {
	for (const sinkType of Object.entries(OutputParameterBase).flatMap(([sinkType, params]) => {
		return 'level' in params ? sinkType : []
	})) {
		const outputType = sinkType as SinkAsOutputForNRPN<'level'>

		const calc = new OutputLevelNRPNCalculator(model, outputType)
		model.forEach(outputType, (output, _outputLabel, outputDesc) => {
			f(calc.calculate(output), outputDesc)
		})
	}
}
