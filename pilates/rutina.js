// Arma las clases de pilates de 50 minutos a partir de la biblioteca de ejercicios.
// Lo usa la app (index.html) y se puede probar con node.
(function (raiz) {
  var ZONAS = ["Lumbar", "Cervical", "Dorsal", "Hombro", "Codo / muñeca", "Cadera", "Rodilla", "Tobillo / pie"];
  var MAQUINAS = ["Mat", "Reformer", "Cadillac", "Wunda", "Core Align", "Barril", "Accesorios"];
  var FASES = ["Calentamiento", "Principal", "Cierre"];
  var NIVELES = { "Básico": 0, "Intermedio": 1, "Avanzado": 2 };
  var POSICIONES = ["Supino", "Sentado", "Lateral", "Prono", "Cuatro apoyos", "Arrodillado", "De pie"];
  var MINUTOS = 50;
  var REPARTO = { Calentamiento: 8, Cierre: 7 }; // lo demás es parte principal

  function activo(ej) { return String(ej.activo || "Sí").trim().toLowerCase() !== "no"; }
  function nivelDe(ej) { var n = NIVELES[ej.nivel]; return n === undefined ? 0 : n; }
  function minutosDe(ej) { return Math.max(1, Number(ej.minutos) || 3); }

  // Cómo le cae un ejercicio a una estudiante según sus zonas con molestia: E (evitar) > A (adaptar) > S (sirve)
  function estadoPara(ej, zonas) {
    var r = { estado: "", zonas: [] };
    var peso = { E: 3, A: 2, S: 1 };
    (zonas || []).forEach(function (z) {
      var v = String((ej.dolor || {})[z] || "").toUpperCase();
      if (!peso[v]) return;
      if (!r.estado || peso[v] > peso[r.estado]) { r.estado = v; r.zonas = [z]; }
      else if (v === r.estado) r.zonas.push(z);
    });
    return r;
  }

  function sorteo(lista, pesoDe, azar) {
    var total = 0, pesos = lista.map(function (x) { var p = Math.max(0, pesoDe(x)); total += p; return p; });
    if (!total) return null;
    var t = azar() * total;
    for (var i = 0; i < lista.length; i++) { t -= pesos[i]; if (t <= 0) return lista[i]; }
    return lista[lista.length - 1];
  }

  // Ejercicios usados hace poco: en general (6 días) y por cada estudiante (sus últimas 3 clases)
  function recientes(historial, alumnas, hoy) {
    var general = {}, porAlumna = alumnas.map(function () { return {}; });
    var limite = new Date(hoy.getTime() - 6 * 86400000).toISOString().slice(0, 10);
    var cuenta = alumnas.map(function () { return 0; });
    (historial || []).slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; }).forEach(function (c) {
      var ids = c.ejercicios || [];
      if (c.fecha >= limite) ids.forEach(function (id) { general[id] = true; });
      alumnas.forEach(function (al, i) {
        var n = normalizar(al.nombre);
        if (!n || cuenta[i] >= 3) return;
        if (normalizar(c.estudiante1) === n || normalizar(c.estudiante2) === n) {
          cuenta[i]++;
          ids.forEach(function (id) { porAlumna[i][id] = true; });
        }
      });
    });
    return { general: general, porAlumna: porAlumna };
  }

  function normalizar(t) {
    return String(t || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
  }

  function Armador(ejercicios, op, historial, azar) {
    this.op = op;
    this.azar = azar || Math.random;
    this.alumnas = (op.alumnas || []).filter(Boolean);
    this.nivel = NIVELES[op.nivel] === undefined ? 0 : NIVELES[op.nivel];
    var maquinas = op.maquinas || [];
    var equipos = op.equipos || null;
    var nivel = this.nivel;
    this.todos = ejercicios.filter(function (ej) { return activo(ej) && nivelDe(ej) <= nivel; });
    this.pool = ejercicios.filter(function (ej) {
      if (!activo(ej) || maquinas.indexOf(ej.maquina) < 0 || nivelDe(ej) > nivel) return false;
      if ((ej.maquina === "Accesorios" || ej.maquina === "Barril") && equipos && equipos.length && ej.equipo) return equipos.indexOf(ej.equipo) >= 0;
      return true;
    });
    this.rec = recientes(historial, this.alumnas, op.hoy ? new Date(op.hoy) : new Date());
  }

  Armador.prototype.estados = function (ej) {
    return this.alumnas.map(function (al) { return estadoPara(ej, al.zonas); });
  };

  Armador.prototype.peso = function (ej) {
    var w = 1, self = this;
    var dif = this.nivel - nivelDe(ej);
    w *= dif === 0 ? 3 : dif === 1 ? 1.3 : 0.6;
    var estados = this.estados(ej);
    var evitan = 0;
    estados.forEach(function (s, i) {
      if (s.estado === "S") w *= 2;
      if (s.estado === "A") w *= 0.8;
      if (s.estado === "E") { w *= 0.25; evitan++; }
      if (self.rec.porAlumna[i] && self.rec.porAlumna[i][ej.id]) w *= 0.1;
    });
    if (evitan && evitan === estados.length) return 0; // ninguna de las dos lo puede hacer
    if (this.rec.general[ej.id]) w *= 0.25;
    return w;
  };

  // Llena una fase hasta su tiempo con ejercicios de ciertas máquinas
  Armador.prototype.llenar = function (fase, maquinas, minutos, usados) {
    var self = this, elegidos = [], suma = 0;
    var deFase = function (f) {
      return self.pool.filter(function (ej) { return ej.fase === f && maquinas.indexOf(ej.maquina) >= 0 && !usados[ej.id]; });
    };
    var fuentes = [deFase(fase)];
    // si una máquina tiene pocos ejercicios de calentamiento o cierre, se completa con ejercicios suaves de la parte principal
    if (fase !== "Principal") fuentes.push(deFase("Principal").filter(function (ej) { return nivelDe(ej) === 0; }), deFase("Principal"));
    for (var f = 0; f < fuentes.length && suma < minutos - 1; f++) {
      var lista = fuentes[f];
      while (suma < minutos - 1) {
        var falta = minutos - suma;
        var caben = lista.filter(function (ej) { return !usados[ej.id] && minutosDe(ej) <= falta + 1; });
        var ej = sorteo(caben, function (x) {
          // variar: menos probable repetir el mismo tipo de movimiento dentro de la misma parte
          var repetidos = elegidos.filter(function (e) { return e.movimiento === x.movimiento; }).length;
          return self.peso(x) * Math.pow(0.5, repetidos);
        }, self.azar);
        if (!ej) break;
        usados[ej.id] = true;
        elegidos.push(ej);
        suma += minutosDe(ej);
      }
    }
    return elegidos;
  };

  Armador.prototype.reemplazo = function (ej, i, usados) {
    var self = this, al = this.alumnas[i];
    var candidatos = function (mismaMaquina) {
      return self.pool.filter(function (x) {
        if (x.id === ej.id || usados[x.id] || x.fase !== ej.fase) return false;
        if (mismaMaquina && x.maquina !== ej.maquina) return false;
        return estadoPara(x, al.zonas).estado !== "E";
      });
    };
    var lista = candidatos(true);
    if (!lista.length) lista = candidatos(false);
    if (!lista.length) { // sin opciones en la misma fase: cualquier ejercicio suave de la misma máquina
      lista = this.pool.filter(function (x) {
        return x.id !== ej.id && !usados[x.id] && x.maquina === ej.maquina && nivelDe(x) === 0 && estadoPara(x, al.zonas).estado !== "E";
      });
    }
    if (!lista.length) { // último recurso: un ejercicio de Mat en el piso, al lado de la máquina
      lista = this.todos.filter(function (x) {
        return x.maquina === "Mat" && !usados[x.id] && x.fase === ej.fase && estadoPara(x, al.zonas).estado !== "E";
      });
    }
    var r = sorteo(lista, function (x) {
      var w = 1, s = estadoPara(x, al.zonas).estado;
      if (s === "S") w *= 3;
      if (s === "A") w *= 0.6;
      if (x.equipo && x.equipo === ej.equipo) w *= 2;
      if (x.movimiento === ej.movimiento) w *= 1.5;
      if (x.posicion === ej.posicion) w *= 1.5;
      return w;
    }, this.azar);
    return r ? r.id : null;
  };

  Armador.prototype.paso = function (ej, usados) {
    var self = this;
    var p = { id: ej.id, fase: ej.fase, maquina: ej.maquina, minutos: minutosDe(ej) };
    p.alumnas = this.estados(ej).map(function (s, i) {
      var a = { estado: s.estado, zonas: s.zonas };
      if (s.estado === "E") {
        a.reemplazo = self.reemplazo(ej, i, usados);
        if (a.reemplazo) usados[a.reemplazo] = true; // que no le salga el mismo reemplazo dos veces
      }
      return a;
    });
    return p;
  };

  function ordenar(lista, maquinas) {
    return lista.slice().sort(function (a, b) {
      return (maquinas.indexOf(a.maquina) - maquinas.indexOf(b.maquina)) ||
        (POSICIONES.indexOf(a.posicion) - POSICIONES.indexOf(b.posicion));
    });
  }

  function armar(ejercicios, op, historial, azar) {
    var A = new Armador(ejercicios, op, historial, azar);
    var maquinas = (op.maquinas || []).slice();
    var usados = {}, total = op.minutos || MINUTOS;
    var cal = A.llenar("Calentamiento", maquinas.length > 1 ? [maquinas[0]] : maquinas, REPARTO.Calentamiento, usados);
    if (!cal.length) cal = A.llenar("Calentamiento", maquinas, REPARTO.Calentamiento, usados);
    var cie = A.llenar("Cierre", maquinas.length > 1 ? [maquinas[maquinas.length - 1]] : maquinas, REPARTO.Cierre, usados);
    if (!cie.length) cie = A.llenar("Cierre", maquinas, REPARTO.Cierre, usados);
    var suma = function (l) { return l.reduce(function (t, e) { return t + minutosDe(e); }, 0); };
    var principal = [], resto = total - suma(cal) - suma(cie);
    // circuito: la parte principal se reparte entre todas las máquinas, en bloques
    maquinas.forEach(function (m, i) {
      var meta = Math.round(resto * (i + 1) / maquinas.length) - suma(principal);
      principal = principal.concat(ordenar(A.llenar("Principal", [m], meta, usados), maquinas));
    });
    if (suma(principal) < resto - 1) principal = principal.concat(A.llenar("Principal", maquinas, resto - suma(principal), usados));
    var lista = ordenar(cal, maquinas).concat(principal, ordenar(cie, maquinas));
    var pasos = lista.map(function (ej) { return A.paso(ej, usados); });
    return ajustar({ opciones: op, pasos: pasos }, total);
  }

  // Si con los ejercicios que hay no se llega a los 50 minutos (máquinas con pocos ejercicios del nivel),
  // se les da un poco más de tiempo (más repeticiones), hasta 1.6 veces lo normal.
  function ajustar(clase, total) {
    var base = 0;
    clase.pasos.forEach(function (p) { p.base = p.base || p.minutos; p.minutos = p.base; base += p.base; });
    if (base && base < total - 1) {
      var factor = Math.min(1.6, total / base), suma = 0;
      clase.pasos.forEach(function (p) { p.minutos = Math.round(p.base * factor); suma += p.minutos; });
      var meta = Math.min(total, Math.floor(base * 1.6));
      var principales = clase.pasos.filter(function (p) { return p.fase === "Principal"; });
      for (var i = 0; suma < meta && principales.length && i < 100; i++) { principales[i % principales.length].minutos++; suma++; }
      for (var j = 0; suma > total && principales.length && j < 100; j++) {
        var p = principales[j % principales.length];
        if (p.minutos > p.base) { p.minutos--; suma--; }
      }
    }
    clase.minutos = clase.pasos.reduce(function (t, p) { return t + p.minutos; }, 0);
    return clase;
  }

  // Cambia un solo ejercicio de la clase por otro de la misma fase y máquina
  function cambiar(ejercicios, clase, indice, historial, azar) {
    var op = clase.opciones, A = new Armador(ejercicios, op, historial, azar);
    var usados = {};
    clase.pasos.forEach(function (p) {
      usados[p.id] = true;
      (p.alumnas || []).forEach(function (a) { if (a.reemplazo) usados[a.reemplazo] = true; });
    });
    var viejo = clase.pasos[indice];
    var actual = ejercicios.filter(function (e) { return e.id === viejo.id; })[0] || { minutos: viejo.minutos };
    var buscar = function (misma) {
      return A.pool.filter(function (e) {
        return !usados[e.id] && e.fase === viejo.fase && (!misma || e.maquina === viejo.maquina);
      });
    };
    var lista = buscar(true);
    if (!lista.length) lista = buscar(false);
    var dif = function (e) { return Math.abs(minutosDe(e) - minutosDe(actual)); };
    var nuevo = sorteo(lista, function (e) { return A.peso(e) / (1 + dif(e)); }, A.azar);
    if (!nuevo) return null;
    var pasos = clase.pasos.map(function (p) { return Object.assign({}, p); });
    usados[nuevo.id] = true;
    pasos[indice] = A.paso(nuevo, usados);
    return ajustar({ opciones: op, pasos: pasos }, op.minutos || MINUTOS);
  }

  var api = { ZONAS: ZONAS, MAQUINAS: MAQUINAS, FASES: FASES, NIVELES: NIVELES, POSICIONES: POSICIONES, estadoPara: estadoPara, armar: armar, cambiar: cambiar, normalizar: normalizar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Rutina = api;
})(this);
