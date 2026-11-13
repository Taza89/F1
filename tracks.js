// tracks.js - Liste over 25 Grand Prix-baner fordelt pr. løb i sæsonen
const tracks = [
    { id: 1, name: "Bahrain International Circuit", country: "🇧🇭 Bahrain", statFocus: "engine" },
    { id: 2, name: "Jeddah Corniche Circuit", country: "🇸🇦 Saudi-Arabien", statFocus: "engine" },
    { id: 3, name: "Albert Park Circuit", country: "🇦🇺 Australien", statFocus: "aero" },
    { id: 4, name: "Suzuka International Racing Course", country: "🇯🇵 Japan", statFocus: "aero" },
    { id: 5, name: "Shanghai International Circuit", country: "🇨🇳 Kina", statFocus: "engine" },
    { id: 6, name: "Miami International Autodrome", country: "🇺🇸 USA", statFocus: "aero" },
    { id: 7, name: "Autodromo Enzo e Dino Ferrari (Imola)", country: "🇮🇹 Italien", statFocus: "reliability" },
    { id: 8, name: "Circuit de Monaco", country: "🇲🇨 Monaco", statFocus: "aero" },
    { id: 9, name: "Circuit Gilles Villeneuve", country: "🇨🇦 Canada", statFocus: "engine" },
    { id: 10, name: "Circuit de Barcelona-Catalunya", country: "🇪🇸 Spanien", statFocus: "aero" },
    { id: 11, name: "Red Bull Ring", country: "🇦🇹 Østrig", statFocus: "engine" },
    { id: 12, name: "Circuit de Silverstone", country: "🇬🇧 Storbritannien", statFocus: "aero" },
    { id: 13, name: "Hungaroring", country: "🇭🇺 Ungarn", statFocus: "aero" },
    { id: 14, name: "Circuit de Spa-Francorchamps", country: "🇧🇪 Belgien", statFocus: "engine" },
    { id: 15, name: "Circuit Zandvoort", country: "🇳🇱 Holland", statFocus: "aero" },
    { id: 16, name: "Autodromo Nazionale Monza", country: "🇮🇹 Italien", statFocus: "engine" },
    { id: 17, name: "Baku City Circuit", country: "🇦🇿 Aserbajdsjan", statFocus: "engine" },
    { id: 18, name: "Marina Bay Street Circuit", country: "🇸🇬 Singapore", statFocus: "reliability" },
    { id: 19, name: "Circuit of the Americas (COTA)", country: "🇺🇸 USA", statFocus: "aero" },
    { id: 20, name: "Autódromo Hermanos Rodríguez", country: "🇲🇽 Mexico", statFocus: "engine" },
    { id: 21, name: "Autódromo José Carlos Pace (Interlagos)", country: "🇧🇷 Brasilien", statFocus: "reliability" },
    { id: 22, name: "Las Vegas Strip Circuit", country: "🇺🇸 USA", statFocus: "engine" },
    { id: 23, name: "Lusail International Circuit", country: "🇶🇦 Qatar", statFocus: "aero" },
    { id: 24, name: "Yas Marina Circuit", country: "🇦🇪 Abu Dhabi", statFocus: "engine" },
    { id: 25, name: "Nürburgring GP", country: "🇩🇪 Tyskland", statFocus: "reliability" }
];

function getTrackByRound(roundNumber) {
    const index = Math.max(0, Math.min(roundNumber - 1, tracks.length - 1));
    return tracks[index];
}

module.exports = { tracks, getTrackByRound };