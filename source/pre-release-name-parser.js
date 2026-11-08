// Exact source excerpts from nms/voyage/voyage.js, frozen 2026-11-04.
// Reference fragments: omitted base generator and UI helpers remain external.

// Original lines 3701-3712
  const NAME_PRE_ROMAN = /\s+[IVX]+$/i, NAME_PRE_CODE = /(\s+[A-Za-z]\d{2}|\s+[Vv]\d+(\.\d+)?|-\d+|\s+-\s+\S{1,2}|\s+(Prime|Major|Minor|Terminus|Void))$/;
  // a name read in the pre-release forms: the stem to search, and the typed name's standing on the wiki, if it has one
  function preReleaseForm(typed) {
    const known = NAME_PRE.get(typed.toLowerCase().replace(/\s+/g, " ").trim());
    let form = typed.replace(/^the\s+(.+?)\s+system$/i, "$1").replace(/^new\s+/i, "");
    for (let i = 0; i < 3; i++) form = form.replace(NAME_PRE_CODE, "");
    const numeral = (form.match(NAME_PRE_ROMAN) || [""])[0].trim();
    form = form.replace(NAME_PRE_ROMAN, "");
    const words = form.split(/[\s-]+/).filter(Boolean), stem = words[0] || "", second = words[1] && /^[a-z']{3,5}$/i.test(words[1]) ? words[1] : "";
    const system = `${stem}${second ? `-${nameCap(second.toLowerCase())}` : ""}${numeral ? ` ${numeral.toUpperCase()}` : ""}`;
    return { known, stem: stem.toLowerCase(), system, numeral, second, changed: system.toLowerCase() !== typed.toLowerCase().replace(/\s+/g, " ").trim() };
  }

