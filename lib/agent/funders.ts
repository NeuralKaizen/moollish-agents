// Vehículos institucionales (§2/§3). Siempre presentes en el prompt — son independientes
// del financiador. El conocimiento por financiador ahora vive en la tabla `funders` y se
// inyecta vía funderBlock (ver lib/agent/funder-match.ts).
export const INSTITUTIONAL_VEHICLES = `
VEHÍCULOS INSTITUCIONALES:
- Moollish: vehículo principal para AgTech, ganadería inteligente, agricultura, trazabilidad, marketplace, IoT/RFID, proyectos productivos.
- Sat2Farm: capacidad satelital — agricultura de precisión, carbono, riesgo climático, biodiversidad, monitoreo ambiental.
- Foundation Nova: vehículo social — juventud rural, mujeres, seguridad alimentaria, educación, inclusión, desarrollo comunitario.
`.trim()
