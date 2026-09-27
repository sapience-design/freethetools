// Unit Converter. Each unit is a factor to the category's base unit (temperature uses formulas).
// Factors are exact definitions (international yard and pound, 1959) where one exists.

export const UNITS = {
  length: { base: "m", units: { mm: ["Millimetre", 0.001], cm: ["Centimetre", 0.01], m: ["Metre", 1], km: ["Kilometre", 1000], in: ["Inch", 0.0254], ft: ["Foot", 0.3048], yd: ["Yard", 0.9144], mi: ["Mile", 1609.344], nmi: ["Nautical mile", 1852] } },
  weight: { base: "kg", units: { mg: ["Milligram", 1e-6], g: ["Gram", 0.001], kg: ["Kilogram", 1], t: ["Tonne", 1000], oz: ["Ounce", 0.028349523125], lb: ["Pound", 0.45359237], st: ["Stone", 6.35029318] } },
  temperature: { base: "C", units: { C: ["Celsius", null], F: ["Fahrenheit", null], K: ["Kelvin", null] } },
  volume: { base: "l", units: { ml: ["Millilitre", 0.001], l: ["Litre", 1], m3: ["Cubic metre", 1000], tsp: ["Teaspoon (US)", 0.00492892159375], tbsp: ["Tablespoon (US)", 0.01478676478125], cup: ["Cup (US)", 0.2365882365], floz: ["Fluid ounce (US)", 0.0295735295625], pt: ["Pint (US)", 0.473176473], gal: ["Gallon (US)", 3.785411784], ukgal: ["Gallon (UK)", 4.54609] } },
  area: { base: "m2", units: { cm2: ["Square centimetre", 1e-4], m2: ["Square metre", 1], ha: ["Hectare", 1e4], km2: ["Square kilometre", 1e6], ft2: ["Square foot", 0.09290304], acre: ["Acre", 4046.8564224], mi2: ["Square mile", 2589988.110336] } },
  speed: { base: "m/s", units: { "m/s": ["Metres per second", 1], "km/h": ["Kilometres per hour", 1 / 3.6], mph: ["Miles per hour", 0.44704], kn: ["Knot", 1852 / 3600] } },
  data: { base: "B", units: { B: ["Byte", 1], KB: ["Kilobyte (1000)", 1e3], MB: ["Megabyte", 1e6], GB: ["Gigabyte", 1e9], TB: ["Terabyte", 1e12], KiB: ["Kibibyte (1024)", 1024], MiB: ["Mebibyte", 1024 ** 2], GiB: ["Gibibyte", 1024 ** 3] } },
};

const toC = { C: (v) => v, F: (v) => ((v - 32) * 5) / 9, K: (v) => v - 273.15 };
const fromC = { C: (v) => v, F: (v) => (v * 9) / 5 + 32, K: (v) => v + 273.15 };

/**
 * @param {number} value
 * @param {keyof typeof UNITS} category
 * @param {string} from unit key
 * @param {string} to unit key
 */
export function convert(value, category, from, to) {
  const cat = UNITS[category];
  if (!cat) throw new Error(`Unknown category "${category}".`);
  if (!(from in cat.units) || !(to in cat.units)) throw new Error("Pick two units from the same group.");
  if (!Number.isFinite(value)) throw new Error("Enter a number.");
  if (category === "temperature") {
    const c = toC[from](value);
    if (c < -273.15 - 1e-9) throw new Error("That's colder than absolute zero.");
    return fromC[to](c);
  }
  return (value * cat.units[from][1]) / cat.units[to][1];
}

/** Round to a sensible number of significant digits for display. */
export const pretty = (n) => (n === 0 ? "0" : Math.abs(n) >= 1e15 || Math.abs(n) < 1e-6 ? n.toExponential(6) : String(+n.toPrecision(10)));
