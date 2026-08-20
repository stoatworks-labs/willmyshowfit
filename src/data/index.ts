/**
 * The device database.
 *
 * Two rules hold across every file here, and `__tests__/data.test.ts` enforces
 * both so they survive a hurried edit:
 *
 *  1. Anything marked `documented` carries at least one citation naming the
 *     document it came from.
 *  2. Device ids are unique, and every device has at least one configuration.
 *
 * Nothing in this database has been checked against hardware. It is vendor
 * paperwork, read carefully and cited. The UI says so; keep it that way.
 */

import type { VideoDevice } from '../lib/fit/evaluate.ts'
import { ANALOG_WAY_DEVICES } from './analogway.ts'
import { BARCO_DEVICES } from './barco.ts'
import { PIXELHUE_DEVICES } from './pixelhue.ts'
import { VISION_MIXER_DEVICES } from './visionmixers.ts'

export const DEVICES: VideoDevice[] = [
  ...ANALOG_WAY_DEVICES,
  ...BARCO_DEVICES,
  ...PIXELHUE_DEVICES,
  ...VISION_MIXER_DEVICES,
]

/**
 * Screen-management systems and vision mixers answer different questions, and
 * mixing them in one ranked list makes the ranking meaningless. The UI shows
 * them as two sections.
 */
export function deviceClass(d: VideoDevice): 'screen-management' | 'vision-mixer' {
  return d.rules.edgeBlending === false ? 'vision-mixer' : 'screen-management'
}

export const VENDORS = [...new Set(DEVICES.map((d) => d.vendor))].sort()
