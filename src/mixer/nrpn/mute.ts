import type { InputOutputType, Model } from '../model.js'
import type { Param } from './param.js'

// Pairs of 7-bit MSB/LSB throughout the rest of this file are the pairs in the
// top of relevant sections of tables in the SQ MIDI Protocol document:
//
// https://www.allen-heath.com/content/uploads/2023/11/SQ-MIDI-Protocol-Issue5.pdf
//
// The general idea is that a base MSB/LSB identifies the top left of a
// rectangular area of a table, and then proceeding left to right, then top to
// bottom, each MSB/LSB taken as a concatenated 14-bit MSB:LSB number increases
// by one.

/** Base parameter MSB/LSB values for mute state of sources/sinks. */
const MuteParameterBase = {
	inputChannel: { MSB: 0x00, LSB: 0x00 },
	lr: { MSB: 0x00, LSB: 0x44 },
	mix: { MSB: 0x00, LSB: 0x45 },
	group: { MSB: 0x00, LSB: 0x30 },
	matrix: { MSB: 0x00, LSB: 0x55 },
	fxSend: { MSB: 0x00, LSB: 0x51 },
	fxReturn: { MSB: 0x00, LSB: 0x3c },
	dca: { MSB: 0x02, LSB: 0x00 },
	muteGroup: { MSB: 0x04, LSB: 0x00 },
} as const satisfies Readonly<Record<InputOutputType, Readonly<Param>>>

/**
 * Calculate the NRPN for the mute state of the numbered input/output of the
 * given type.
 *
 * @param model
 *   The mixer model for which the NRPN is computed.
 * @param inputOutputType
 *   The type of the input/output, e.g. `'inputChannel'`.
 * @param n
 *   The specific zero-indexed input/output instance, e.g. `7` to refer to input
 *   channel 8.
 * @returns
 *   The NRPN for the identified input/output.
 */
export function calculateMuteNRPN(model: Model, inputOutputType: InputOutputType, n: number): Param {
	if (model.inputOutputCounts[inputOutputType] <= n) {
		throw new Error(`${inputOutputType}=${n} is invalid`)
	}

	const { MSB, LSB } = MuteParameterBase[inputOutputType]

	const val = LSB + n
	return { MSB: MSB + ((val >> 7) & 0xf), LSB: val & 0x7f }
}
