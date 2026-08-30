// Dial codes for the phone inputs, held locally.
//
// These used to come from api.restcountries.com on every mount. That API now
// rejects anonymous calls (401 on /v3.1/all, 403 on /countries/v5), so the
// request only ever produced console errors before falling back to a
// hardcoded seven-country list — and the call that carried a key shipped that
// key to the browser. The data is static, so it lives here instead.
//
// Names are not stored: `Intl.DisplayNames` renders them in the reader's
// locale, which is the only way this list can be bilingual without a second
// column that drifts out of sync with the first.

export type Country = {
  /** ISO 3166-1 alpha-2, lowercase — also the flag file name. */
  readonly iso2: string;
  /** E.164 calling code, with the leading `+`. */
  readonly dial: string;
};

/** Shown first, above the alphabetical rest: where this app's users are. */
export const PRIORITY_ISO2: readonly string[] = ["ar", "mx", "es", "co", "cl", "pe", "us"];

export const COUNTRIES: readonly Country[] = [
  { iso2: "ar", dial: "+54" },
  { iso2: "au", dial: "+61" },
  { iso2: "at", dial: "+43" },
  { iso2: "be", dial: "+32" },
  { iso2: "bo", dial: "+591" },
  { iso2: "br", dial: "+55" },
  { iso2: "bg", dial: "+359" },
  { iso2: "ca", dial: "+1" },
  { iso2: "cl", dial: "+56" },
  { iso2: "cn", dial: "+86" },
  { iso2: "co", dial: "+57" },
  { iso2: "cr", dial: "+506" },
  { iso2: "hr", dial: "+385" },
  { iso2: "cu", dial: "+53" },
  { iso2: "cy", dial: "+357" },
  { iso2: "cz", dial: "+420" },
  { iso2: "dk", dial: "+45" },
  { iso2: "do", dial: "+1809" },
  { iso2: "ec", dial: "+593" },
  { iso2: "eg", dial: "+20" },
  { iso2: "sv", dial: "+503" },
  { iso2: "ee", dial: "+372" },
  { iso2: "fi", dial: "+358" },
  { iso2: "fr", dial: "+33" },
  { iso2: "de", dial: "+49" },
  { iso2: "gr", dial: "+30" },
  { iso2: "gt", dial: "+502" },
  { iso2: "hn", dial: "+504" },
  { iso2: "hk", dial: "+852" },
  { iso2: "hu", dial: "+36" },
  { iso2: "is", dial: "+354" },
  { iso2: "in", dial: "+91" },
  { iso2: "id", dial: "+62" },
  { iso2: "ie", dial: "+353" },
  { iso2: "il", dial: "+972" },
  { iso2: "it", dial: "+39" },
  { iso2: "jp", dial: "+81" },
  { iso2: "ke", dial: "+254" },
  { iso2: "lv", dial: "+371" },
  { iso2: "lt", dial: "+370" },
  { iso2: "lu", dial: "+352" },
  { iso2: "my", dial: "+60" },
  { iso2: "mt", dial: "+356" },
  { iso2: "mx", dial: "+52" },
  { iso2: "ma", dial: "+212" },
  { iso2: "nl", dial: "+31" },
  { iso2: "nz", dial: "+64" },
  { iso2: "ni", dial: "+505" },
  { iso2: "ng", dial: "+234" },
  { iso2: "no", dial: "+47" },
  { iso2: "pa", dial: "+507" },
  { iso2: "py", dial: "+595" },
  { iso2: "pe", dial: "+51" },
  { iso2: "ph", dial: "+63" },
  { iso2: "pl", dial: "+48" },
  { iso2: "pt", dial: "+351" },
  { iso2: "pr", dial: "+1787" },
  { iso2: "ro", dial: "+40" },
  { iso2: "ru", dial: "+7" },
  { iso2: "sa", dial: "+966" },
  { iso2: "rs", dial: "+381" },
  { iso2: "sg", dial: "+65" },
  { iso2: "sk", dial: "+421" },
  { iso2: "si", dial: "+386" },
  { iso2: "za", dial: "+27" },
  { iso2: "kr", dial: "+82" },
  { iso2: "es", dial: "+34" },
  { iso2: "se", dial: "+46" },
  { iso2: "ch", dial: "+41" },
  { iso2: "tw", dial: "+886" },
  { iso2: "th", dial: "+66" },
  { iso2: "tr", dial: "+90" },
  { iso2: "ua", dial: "+380" },
  { iso2: "ae", dial: "+971" },
  { iso2: "gb", dial: "+44" },
  { iso2: "us", dial: "+1" },
  { iso2: "uy", dial: "+598" },
  { iso2: "ve", dial: "+58" },
  { iso2: "vn", dial: "+84" },
];

/** Flag image for a country. This host serves flags without a key. */
export function flagUrl(iso2: string): string {
  return `https://flags.restcountries.com/v5/svg/${iso2}.svg`;
}

/**
 * The country's name in `locale`, falling back to the code itself where
 * `Intl.DisplayNames` is missing or has no entry.
 */
export function countryName(iso2: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(iso2.toUpperCase()) ?? iso2.toUpperCase();
  } catch {
    return iso2.toUpperCase();
  }
}

export type ResolvedCountry = Country & { readonly name: string; readonly flag: string };

/**
 * The list ready to render: named in `locale`, the countries this app's users
 * actually dial first, then everything else alphabetically by that name.
 */
export function countryOptions(locale: string): readonly ResolvedCountry[] {
  const resolved = COUNTRIES.map((c) => ({
    ...c,
    name: countryName(c.iso2, locale),
    flag: flagUrl(c.iso2),
  }));
  const priority = PRIORITY_ISO2.map((iso2) => resolved.find((c) => c.iso2 === iso2)).filter(
    (c): c is ResolvedCountry => c !== undefined,
  );
  const rest = resolved
    .filter((c) => !PRIORITY_ISO2.includes(c.iso2))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  return [...priority, ...rest];
}
