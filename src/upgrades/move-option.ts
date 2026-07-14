import type { CompanionOptionValues, CompanionInputFieldBase } from '@companion-module/base'

/** Rename an option named `oldId` to `newId` in `options`. */
export function moveOption(
	options: CompanionOptionValues,
	oldId: CompanionInputFieldBase['id'],
	newId: CompanionInputFieldBase['id'],
): void {
	const val = options[oldId]
	delete options[oldId]

	options[newId] = val
}
