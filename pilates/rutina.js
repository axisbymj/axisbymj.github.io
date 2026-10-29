// Arma las clases de pilates de 50 minutos a partir de la biblioteca de ejercicios.
// Lo usa la app (index.html) y se puede probar con node.
(function (raiz) {
  var ZONAS = ["Lumbar", "Cervical", "Dorsal", "Hombro", "Codo / muñeca", "Cadera", "Rodilla", "Tobillo / pie"];
  var MAQUINAS = ["Mat", "Reformer", "Cadillac", "Wunda", "Core Align", "Barril", "Accesorios"];
  var FASES = ["Calentamiento", "Principal", "Cierre"];
  var NIVELES = { "Básico": 0, "Intermedio": 1, "Avanzado": 2 };
  var POSICIONES = ["Supino", "Sentado", "Lateral", "Prono", "Cuatro apoyos", "Arrodillado", "De pie"];
  var MINUTOS = 50;
  // Estructura de la clase: calentamiento 5 ejercicios (10 min) y cierre 1 (5 min), con su tiempo repartido entre ellos.
  // Parte principal = 35 min por tiempo de ejercicio: cada ejercicio dura lo mismo, también cada uno de los que van
  // dentro de una serie. Base = clase de Juliana del 24-oct: Arm series (6 adentro) + Standing leg series (3)
  // + 3 ejercicios = 12 ejercicios en 35 min → unos 2,9 min cada uno.
  var CANTIDAD = { Calentamiento: 5, Cierre: 1 };
  var TIEMPO = { Calentamiento: 10, Principal: 35, Cierre: 5 };
  var POR_EJERCICIO = 35 / 12;

  function activo(ej) { return String(ej.activo || "Sí").trim().toLowerCase() !== "no"; }
  function nivelDe(ej) { var n = NIVELES[ej.nivel]; return n === undefined ? 0 : n; }
  function esSerie(ej) { return !!String((ej && ej.incluye) || "").trim(); }
  // cuántos ejercicios son: 1, o los que trae adentro si es una serie
  function cuantos(ej) { return esSerie(ej) ? Math.max(1, String(ej.incluye).split("·").filter(function (x) { return x.trim(); }).length) : 1; }

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

  // Resortes: dos ejercicios con la misma clave se hacen seguidos sin tocar los resortes
  function claveResortes(ej) {
    var r = normalizar(ej && ej.resortes).replace(/\s*[,·]\s*/g, " · ");
    return r ? ej.maquina + "|" + r : "";
  }
  // 2 = mismos resortes · 1 = mismos resortes pero cambia la altura o la barra · 0 = hay que cambiarlos
  function parecido(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 2;
    return a.split(" · ")[0] === b.split(" · ")[0] ? 1 : 0;
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
    this.montajes = {}; // resortes que ya salieron en la clase: se prefieren para cambiarlos menos
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

  // Elige cierta cantidad de ejercicios de una fase y de ciertas máquinas.
  // En la parte principal la cantidad cuenta también los ejercicios de adentro de cada serie.
  Armador.prototype.elegir = function (fase, maquinas, cantidad, usados) {
    var self = this, elegidos = [], lleva = 0;
    var medida = function (ej) { return fase === "Principal" ? cuantos(ej) : 1; };
    var deFase = function (f) {
      return self.pool.filter(function (ej) { return ej.fase === f && maquinas.indexOf(ej.maquina) >= 0 && !usados[ej.id]; });
    };
    var fuentes = [deFase(fase)];
    // si una máquina tiene pocos ejercicios de calentamiento o cierre, se completa con ejercicios suaves de la parte principal
    // (sin sus series, que son largas)
    if (fase !== "Principal") {
      fuentes.push(deFase("Principal").filter(function (ej) { return nivelDe(ej) === 0 && !esSerie(ej); }),
        deFase("Principal").filter(function (ej) { return !esSerie(ej); }));
    }
    // que quepa en lo que falta; en calentamiento y cierre, máximo 2 series (p. ej. footwork)
    var cabe = function (x) {
      if (usados[x.id] || medida(x) > cantidad - lleva) return false;
      return fase === "Principal" || !esSerie(x) || elegidos.filter(esSerie).length < 2;
    };
    for (var f = 0; f < fuentes.length && lleva < cantidad; f++) {
      var lista = fuentes[f];
      while (lleva < cantidad) {
        var ej = sorteo(lista.filter(cabe), function (x) {
          // variar: menos probable repetir el mismo tipo de movimiento (o la misma máquina) dentro de la misma parte
          var repetidos = elegidos.filter(function (e) { return e.movimiento === x.movimiento; }).length;
          var mismaMaq = maquinas.length > 1 ? elegidos.filter(function (e) { return e.maquina === x.maquina; }).length : 0;
          return self.peso(x) * Math.pow(0.5, repetidos) * Math.pow(0.3, mismaMaq) * (self.montajes[claveResortes(x)] ? 2.5 : 1);
        }, self.azar);
        if (!ej) break;
        usados[ej.id] = true;
        if (claveResortes(ej)) self.montajes[claveResortes(ej)] = true;
        elegidos.push(ej);
        lleva += medida(ej);
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
    var p = { id: ej.id, fase: ej.fase, maquina: ej.maquina, serie: esSerie(ej), cuantos: cuantos(ej), minutos: 0 };
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

  // Ordena por máquina (en el orden del circuito) y, dentro de cada máquina, junta los ejercicios
  // que usan los mismos resortes. "previa" = los resortes con los que viene la clase.
  function ordenar(lista, maquinas, previa) {
    var orden = maquinas.slice();
    lista.forEach(function (e) { if (orden.indexOf(e.maquina) < 0) orden.push(e.maquina); });
    var porPosicion = function (a, b) { return POSICIONES.indexOf(a.posicion) - POSICIONES.indexOf(b.posicion); };
    var salida = [], ultima = previa || "";
    orden.forEach(function (m) {
      var grupos = {}, claves = [];
      lista.filter(function (e) { return e.maquina === m; }).sort(porPosicion).forEach(function (e) {
        var k = claveResortes(e);
        if (!grupos[k]) { grupos[k] = []; claves.push(k); }
        grupos[k].push(e);
      });
      while (claves.length) { // sigue con los resortes más parecidos a los que quedaron puestos
        var mejor = 0;
        claves.forEach(function (k, i) { if (parecido(ultima, k) > parecido(ultima, claves[mejor])) mejor = i; });
        var k = claves.splice(mejor, 1)[0];
        salida = salida.concat(grupos[k]);
        if (k) ultima = k;
      }
    });
    return salida;
  }

  function ultimosResortes(lista, previa) {
    for (var i = lista.length - 1; i >= 0; i--) if (claveResortes(lista[i])) return claveResortes(lista[i]);
    return previa || "";
  }

  function armar(ejercicios, op, historial, azar) {
    var A = new Armador(ejercicios, op, historial, azar);
    var maquinas = (op.maquinas || []).slice();
    var usados = {};
    // parte principal (va primero para que el calentamiento no le gaste los ejercicios): se llena hasta 35 min
    // contando cada ejercicio (y cada uno de los de adentro de una serie) a 2,9 min
    var principal = [], meta = Math.round(TIEMPO.Principal / POR_EJERCICIO);
    var lleva = function () { return principal.reduce(function (t, e) { return t + cuantos(e); }, 0); };
    // circuito: primero un ejercicio de cada máquina, y lo demás repartido entre todas
    if (maquinas.length > 1) maquinas.forEach(function (m) { if (lleva() < meta) principal = principal.concat(A.elegir("Principal", [m], 1, usados)); });
    principal = principal.concat(A.elegir("Principal", maquinas, meta - lleva(), usados));
    // si la máquina no tiene suficientes ejercicios del nivel, cada uno lleva un poco más de tiempo (más
    // repeticiones), hasta 1.6 veces lo normal
    op.estirar = principal.length && lleva() < meta ? Math.min(1.6, meta / lleva()) : 0;
    // en circuito el calentamiento va en la primera máquina y el cierre en la última
    var parte = function (fase, maquina) {
      var l = A.elegir(fase, maquinas.length > 1 ? [maquina] : maquinas, CANTIDAD[fase], usados);
      if (l.length < CANTIDAD[fase]) l = l.concat(A.elegir(fase, maquinas, CANTIDAD[fase] - l.length, usados));
      if (!l.length) { // la máquina no tiene ninguno de esa parte: uno de Mat en el piso, al lado de la máquina
        var mat = A.todos.filter(function (x) { return x.maquina === "Mat" && x.fase === fase && !usados[x.id] && !esSerie(x); });
        var ej = sorteo(mat, function (x) { return A.peso(x); }, A.azar);
        if (ej) { usados[ej.id] = true; l = [ej]; }
      }
      return l;
    };
    var cal = ordenar(parte("Calentamiento", maquinas[0]), maquinas);
    var cie = parte("Cierre", maquinas[maquinas.length - 1]);
    // el calentamiento termina con unos resortes que también use la parte principal, para seguir sin cambiarlos
    var enPrincipal = {};
    principal.forEach(function (e) { if (claveResortes(e)) enPrincipal[claveResortes(e)] = true; });
    var siguen = cal.filter(function (e) { return enPrincipal[claveResortes(e)]; });
    var final = siguen.length ? claveResortes(siguen[siguen.length - 1]) : "";
    if (final) cal = cal.filter(function (e) { return claveResortes(e) !== final; }).concat(cal.filter(function (e) { return claveResortes(e) === final; }));
    principal = ordenar(principal, maquinas, ultimosResortes(cal));
    cie = ordenar(cie, maquinas, ultimosResortes(principal, ultimosResortes(cal)));
    var pasos = [];
    [[cal, "Calentamiento"], [principal, "Principal"], [cie, "Cierre"]].forEach(function (parte) {
      // la parte en la que se eligió (un ejercicio de la parte principal puede completar el cierre)
      parte[0].forEach(function (ej) { var p = A.paso(ej, usados); p.fase = parte[1]; pasos.push(p); });
    });
    return ajustar({ opciones: op, pasos: pasos });
  }

  // Minutos de cada ejercicio. Calentamiento y cierre: su tiempo (10 y 5 min) repartido entre sus ejercicios.
  // Parte principal: 2,9 min por ejercicio (una serie, 2,9 por cada uno de los que trae adentro), así que si se
  // agregan o quitan ejercicios la clase dura más o menos, y en una clase armada a mano se ve cuánto falta.
  function ajustar(clase, ejercicios) {
    var escala = (clase.opciones.minutos || MINUTOS) / MINUTOS;
    FASES.forEach(function (fase) {
      var pasos = clase.pasos.filter(function (p) { return p.fase === fase; });
      if (!pasos.length) return;
      if (ejercicios) pasos.forEach(function (p) { var ej = buscarEj(ejercicios, p.id); if (ej) { p.serie = esSerie(ej); p.cuantos = cuantos(ej); } });
      var exacto = fase === "Principal"
        ? pasos.map(function (p) { return (p.cuantos || 1) * POR_EJERCICIO * escala * (clase.opciones.estirar || 1); })
        : pasos.map(function () { return TIEMPO[fase] * escala / pasos.length; });
      var total = Math.round(exacto.reduce(function (t, v) { return t + v; }, 0));
      // reparto exacto: cada uno su parte redondeada hacia abajo y los minutos sobrantes a los de mayor fracción
      var partes = exacto.map(function (v, i) { return { i: i, min: Math.floor(v), resto: v % 1 }; });
      var sobra = total - partes.reduce(function (t, x) { return t + x.min; }, 0);
      partes.slice().sort(function (a, b) { return b.resto - a.resto || a.i - b.i; }).slice(0, sobra).forEach(function (x) { x.min++; });
      partes.forEach(function (x) { pasos[x.i].minutos = Math.max(1, x.min); delete pasos[x.i].base; });
    });
    clase.minutos = clase.pasos.reduce(function (t, p) { return t + p.minutos; }, 0);
    return clase;
  }

  // Cambia un solo ejercicio de la clase por otro de la misma fase y máquina
  function cambiar(ejercicios, clase, indice, historial, azar) {
    var op = clase.opciones, A = new Armador(ejercicios, op, historial, azar);
    var usados = usadosEn(clase);
    var viejo = clase.pasos[indice];
    var actual = ejercicios.filter(function (e) { return e.id === viejo.id; })[0] || {};
    var tam = viejo.fase === "Principal" ? (actual.id ? cuantos(actual) : viejo.cuantos || 1) : 1;
    var buscar = function (misma) {
      return A.pool.filter(function (e) {
        return !usados[e.id] && e.fase === viejo.fase && (!misma || e.maquina === viejo.maquina);
      });
    };
    var lista = buscar(true);
    if (!lista.length) lista = buscar(false);
    var nuevo = sorteo(lista, function (e) {
      // mejor uno que dure parecido (en la principal, una serie con tantos ejercicios como la otra), y si no hay que tocar los resortes
      var dif = viejo.fase === "Principal" ? Math.abs(cuantos(e) - tam) : 0;
      return A.peso(e) / (1 + dif) * (1 + 2 * parecido(claveResortes(actual), claveResortes(e)));
    }, A.azar);
    if (!nuevo) return null;
    var pasos = copiar(clase.pasos);
    usados[nuevo.id] = true;
    pasos[indice] = A.paso(nuevo, usados);
    pasos[indice].fase = viejo.fase;
    return ajustar({ opciones: op, pasos: pasos }, ejercicios);
  }

  // ——— Cambios a mano sobre una clase ya armada ———
  function usadosEn(clase) {
    var usados = {};
    clase.pasos.forEach(function (p) {
      usados[p.id] = true;
      (p.alumnas || []).forEach(function (a) { if (a.reemplazo) usados[a.reemplazo] = true; });
    });
    return usados;
  }
  function copiar(pasos) { return pasos.map(function (p) { return Object.assign({}, p); }); }
  function buscarEj(ejercicios, id) { return ejercicios.filter(function (e) { return e.id === id; })[0]; }

  // Dónde va un ejercicio nuevo: en su parte de la clase, después de los que usan los mismos resortes;
  // si no hay, al final de su máquina (respetando el orden del circuito).
  function lugar(ejercicios, pasos, p, maquinas) {
    var fase = FASES.indexOf(p.fase), maq = maquinas.indexOf(p.maquina);
    var k = claveResortes(buscarEj(ejercicios, p.id)), mismos = -1, final = 0;
    pasos.forEach(function (x, i) {
      var f = FASES.indexOf(x.fase);
      if (f === fase && k && claveResortes(buscarEj(ejercicios, x.id)) === k) mismos = i + 1;
      if (f < fase || (f === fase && maquinas.indexOf(x.maquina) <= maq)) final = i + 1;
    });
    return mismos >= 0 ? mismos : final;
  }

  function agregar(ejercicios, clase, id, fase, historial) {
    var op = clase.opciones, A = new Armador(ejercicios, op, historial);
    var ej = buscarEj(ejercicios, id);
    if (!ej) return null;
    var usados = usadosEn(clase);
    usados[id] = true;
    var p = A.paso(ej, usados);
    p.fase = fase || ej.fase;
    var pasos = copiar(clase.pasos);
    pasos.splice(lugar(ejercicios, pasos, p, op.maquinas || []), 0, p);
    return ajustar({ opciones: op, pasos: pasos }, ejercicios);
  }

  function reemplazar(ejercicios, clase, indice, id, historial) {
    var op = clase.opciones, A = new Armador(ejercicios, op, historial);
    var ej = buscarEj(ejercicios, id);
    if (!ej) return null;
    var usados = usadosEn(clase);
    usados[id] = true;
    var pasos = copiar(clase.pasos);
    var p = A.paso(ej, usados);
    p.fase = pasos[indice].fase;
    pasos[indice] = p;
    return ajustar({ opciones: op, pasos: pasos }, ejercicios);
  }

  function quitar(clase, indice) {
    var pasos = copiar(clase.pasos);
    pasos.splice(indice, 1);
    return ajustar({ opciones: clase.opciones, pasos: pasos });
  }

  // Cambian las estudiantes o sus zonas de dolor (clase guardada que se edita o se usa con otras):
  // los mismos ejercicios, pero las notas de cada una se vuelven a calcular. Si a alguna ya le habían
  // puesto un reemplazo y lo sigue necesitando, se le deja el mismo.
  function cambiarAlumnas(ejercicios, clase, alumnas, historial) {
    var op = Object.assign({}, clase.opciones, { alumnas: alumnas });
    var A = new Armador(ejercicios, op, historial);
    var usados = usadosEn(clase);
    var pasos = clase.pasos.map(function (viejo) {
      var ej = buscarEj(ejercicios, viejo.id);
      if (!ej) return Object.assign({}, viejo);
      var p = Object.assign({}, viejo);
      p.alumnas = A.estados(ej).map(function (s, i) {
        var a = { estado: s.estado, zonas: s.zonas }, antes = (viejo.alumnas || [])[i] || {};
        if (s.estado === "E") {
          a.reemplazo = antes.estado === "E" && antes.reemplazo ? antes.reemplazo : A.reemplazo(ej, i, usados);
          if (a.reemplazo) usados[a.reemplazo] = true;
        }
        return a;
      });
      return p;
    });
    return ajustar({ opciones: op, pasos: pasos }, ejercicios);
  }

  var api = {
    ZONAS: ZONAS, MAQUINAS: MAQUINAS, FASES: FASES, NIVELES: NIVELES, POSICIONES: POSICIONES, MINUTOS: MINUTOS,
    estadoPara: estadoPara, armar: armar, cambiar: cambiar, agregar: agregar, reemplazar: reemplazar, quitar: quitar,
    claveResortes: claveResortes, normalizar: normalizar, ajustar: ajustar, cambiarAlumnas: cambiarAlumnas,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.Rutina = api;
})(this);
