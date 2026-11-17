/* Imprim Bal 2 — prénoms : liste et rapprochement.
   Repris de la V1 (bloc BalNames de index.html, état v1-finale, commit 8e6de26) puis modifié ici pour la V2 :
   la V1 n'importe pas ce fichier et n'est pas touchée. Module ES, utilisable dans un Worker et dans Node (banc). */
var BalNames = (function () {
  var LIST = (
    // French, male
    'Adam Adrien Alain Alban Albert Albin Aldric Alexandre Alexis Alfred Alphonse Amaury Ambroise Anatole André Anselme Anthony Antoine Antonin ' +
    'Armand Arnaud Arsène Arthur Auguste Augustin Aurélien Axel Baptiste Barthélemy Basile Bastien Benjamin Benoît Bernard Bertrand Blaise Boris ' +
    'Brice Bruno Bryan Calvin Camille Cédric Charles Charly Christian Christophe Claude Clément Colin Corentin Cyprien Cyril Cyrille Damien Daniel ' +
    'David Denis Didier Dimitri Dominique Dorian Dylan Edgar Edmond Édouard Élie Éliott Eliot Elliot Émile Emilien Emmanuel Enzo Éric Erwan Erwann ' +
    'Esteban Ethan Étienne Eugène Evan Fabien Fabrice Félix Ferdinand Fernand Firmin Florent Florian Francis Franck François Frédéric Gabin Gabriel ' +
    'Gaël Gaëtan Gaspard Gaston Gauthier Gautier Geoffrey Georges Gérald Gérard Germain Gilbert Gilles Grégoire Grégory Guillaume Gustave Guy Hadrien ' +
    'Hector Henri Hervé Hippolyte Hubert Hugo Hugues Ignace Isaac Jacques Jason Jean Jérémie Jérémy Jérôme Joachim Joël Johan Johann Jonathan Jordan ' +
    'Joris Joseph Josué Jules Julien Justin Kenzo Kévin Killian Kylian Laurent Léandre Lenny Léo Léon Léonard Liam Lionel Loïc Lorenzo Loris Louis ' +
    'Louka Luc Lucas Lucien Ludovic Luka Maël Malo Marc Marcel Marin Marius Martin Mathéo Matéo Mattéo Mathias Mathieu Matthieu Matthias Maurice Max ' +
    'Maxence Maxime Michel Mickaël Milan Morgan Nathan Nathanaël Nicolas Noah Noam Noé Noël Nolan Octave Olivier Owen Pacôme Pascal Patrice Patrick ' +
    'Paul Philippe Pierre Quentin Raphaël Raymond Régis Rémi Rémy René Richard Robert Robin Rodolphe Roger Roland Romain Romaric Ruben Sacha Samuel ' +
    'Sébastien Serge Simon Stanislas Stéphane Steven Sullivan Sylvain Teddy Théo Théodore Théophile Thibault Thibaut Thierry Thomas Timéo Timothée ' +
    'Titouan Tom Tony Tristan Ugo Ulysse Valentin Valère Victor Vincent Virgile Wilfried Xavier Yann Yannick Yoann Yoan Yohan Yohann Yves Yvon Zacharie ' +
    // French, female
    'Adèle Adeline Agathe Agnès Albane Alexandra Alexia Alice Alicia Aliénor Aline Alix Amandine Ambre Amélie Anaëlle Anaïs Andrée Angèle Angélique ' +
    'Anna Anne Annabelle Annick Annie Anouk Apolline Ariane Arlette Astrid Audrey Aurélie Aurore Axelle Béatrice Bénédicte Bérangère Bérénice ' +
    'Bernadette Blanche Brigitte Capucine Carine Carla Carole Caroline Cassandre Catherine Cécile Céleste Céline Chantal Charlène Charlotte Chloé ' +
    'Christelle Christiane Christine Cindy Claire Clara Clarisse Claudine Clélia Clémence Clémentine Colette Coline Constance Coralie Corinne Cynthia ' +
    'Danielle Danièle Daphné Delphine Denise Diane Dorothée Édith Éléonore Éliane Élisa Élisabeth Élise Ella Élodie Éloïse Elsa Émeline Émilie Emma ' +
    'Emmanuelle Emy Enora Estelle Esther Eugénie Eva Ève Évelyne Fabienne Fanny Fiona Flavie Florence Françoise Frédérique Gabrielle Gaëlle ' +
    'Geneviève Georgette Ginette Gisèle Gwendoline Hélène Héloïse Henriette Hortense Inès Irène Iris Isabelle Jacqueline Jade Jasmine Jeanne Jeannine ' +
    'Jennifer Jenny Jessica Joëlle Johanna Josette Josiane Judith Julia Julie Juliette Justine Karine Kelly Laetitia Laëtitia Lalie Lana Lara Laura ' +
    'Laure Laurence Léa Léna Lena Léonie Lila Liliane Lilou Lily Lina Line Lisa Lise Lison Lola Lou Louane Louise Louna Lucie Lucile Lucille Luna Lya ' +
    'Lydie Madeleine Maëlle Maëlys Maëva Magali Maïa Maïwenn Manon Margaux Margot Marguerite Maria Marianne Marie Marilyn Marine Marion Marthe Martine ' +
    'Marylène Maryse Mathilde Maud Maude Maylis Mélanie Mélina Mélissa Michèle Micheline Mila Mireille Monique Morgane Muriel Myriam Nadège Nadine ' +
    'Nathalie Nelly Nicole Nina Noa Noémie Noëlle Océane Odette Odile Olivia Ophélie Pascale Patricia Paule Paulette Pauline Pénélope Perrine Rachel ' +
    'Rebecca Régine Renée Romane Rosalie Rose Roxane Ruth Sabine Sabrina Salomé Sandra Sandrine Sara Sarah Séverine Simone Sixtine Solène Soline ' +
    'Sophie Stéphanie Suzanne Sylvie Tessa Thaïs Tiphaine Typhaine Valentine Valérie Vanessa Véronique Victoire Victoria Violette Virginie Viviane ' +
    'Yvette Yvonne Zoé ' +
    // Basque
    'Ainara Ainhoa Aitor Alaia Amaia Amets Ander Andoni Ane Arantxa Aritz Arrate Asier Battitte Begoña Beñat Edurne Ekaitz Ellande Endika Enaut Eneko ' +
    'Eneritz Garazi Gaizka Gorka Haizea Iban Ibai Ibon Iker Imanol Iñaki Iñigo Irati Itziar Izaskun Joanes Jon Joseba Josu Julen Kattalin Kepa Koldo ' +
    'Laida Leire Libe Lorea Lur Maddi Maialen Maider Maite Malen Manex Mattin Mikel Miren Nahia Naia Nekane Nerea Nora Oier Oihana Olatz Paxkal Patxi ' +
    'Peio Txomin Udane Unai Usoa Uxue Xabi Xabier Xan Zuriñe ' +
    // Spanish, Portuguese, Italian
    'Alejandro Alberto Alessandro Alessia Alfonso Álvaro Ana Andrea Andrés Ángel Angelo Antonella Antonio Artur Beatriz Bruna Carlos Carmen Chiara ' +
    'Claudia Cláudia Claudio Cláudio Conceição Cristina Davide Diego Dolores Domenico Duarte Eduardo Elena Emilio Enrique Fátima Federico Felipe ' +
    'Fernando Filipa Francesca Francesco Francisco Gabriela Giacomo Gianni Giorgio Giovanni Giulia Giuseppe Gonçalo Gonzalo Guadalupe Ignacio Isabel ' +
    'Javier Jesús Joana João Joaquim Joaquín Jorge José Josefa Juan Juana Julio Leonor Lorena Luca Lucia Lucía Luis Luís Luisa Manuel Manuela Marcelo ' +
    'Marco Marcos Margarita María Mariana Mario Marta Matteo Mercedes Miguel Milagros Mónica Nuria Pablo Paloma Paola Paolo Paulo Pedro Pietro Pilar ' +
    'Rafael Ramón Raquel Ricardo Roberta Roberto Rocío Rosa Rosario Rui Salvatore Santiago Sergio Silvia Sofía Sónia Stefano Teresa Tiago Tomás ' +
    'Valentina Vicente Víctor Vítor Yolanda Zélia ' +
    // Maghreb, Turkey, Middle East
    'Abdel Abdelkader Abdellah Abderrahmane Abdou Adel Ahmed Aïcha Ali Amel Amina Amine Amir Anissa Asma Aya Ayoub Bilal Djamel Elias Farid Fatima ' +
    'Fatma Hakim Hamza Hassan Hichem Houria Ibrahim Idir Ilyas Ilyes Imane Ismaël Jamal Kader Kaïs Kaïss Kamel Karim Khadija Lamia Leïla Lyes Malik ' +
    'Mehdi Meriem Mohamed Mohammed Mohand Mounir Mourad Nabil Nadia Naïma Nassim Nawel Noor Nordine Nour Omar Rachid Rania Rayan Redouane Riad Saïd ' +
    'Salim Samia Sami Samir Samira Sana Selma Sofiane Sonia Souad Sophia Tarek Walid Wassim Yacine Yanis Yasmina Yasmine Youssef Yousra Zakaria ' +
    'Zineb Zohra ' +
    // Western and Central Africa
    'Abdoulaye Aïssatou Aminata Awa Binta Boubacar Cheikh Fatou Ibrahima Kadiatou Mamadou Mariama Modou Moussa Oumar Ousmane Seydou ' +
    // Eastern Europe
    'Anastasia Andreï Daria Dmitri Ekaterina Igor Irina Ivan Kateryna Katarzyna Ksenia Ludmila Marina Mykola Natacha Natalia Nikita Oksana ' +
    'Oleksandr Olena Olga Pavel Piotr Sergueï Svetlana Tatiana Viktor Vladimir Yaroslav Youri Yulia ' +
    // Romanian
    'Adrian Alexandru Alina Andreea Andrei Bogdan Constantin Cristian Dumitru Florentina Florin Gheorghe Ioana Ion Ionel Ionut Lucian Mihaela Mihai Mircea Nicolae Petru Radu Sorin Stefan Vasile Viorel ' +
    // English and others
    'Ashley Charlie Emily Grace Harry James Jimmy John Kimberley Laïa Mandy Melissa Mia Nancy Oliver Peggy Steve Wendy William'
  ).split(/\s+/);

  // Common surnames that sit close to a first name: never 'corrected' into one.
  var PROTECT = {};
  'Martin Bernard Thomas Petit Robert Richard Durand Dubois Moreau Laurent Simon Michel Lefebvre Leroy Roux David Bertrand Morel Fournier Girard Bonnet Dupont Lambert Fontaine Rousseau Vincent Muller Lefevre Faure Andre Mercier Blanc Guerin Boyer Garnier Chevalier Francois Legrand Gauthier Garcia Perrin Robin Clement Morin Nicolas Henry Roussel Mathieu Gautier Masson Marchand Duval Denis Dumont Marie Lemaire Noel Meyer Dufour Meunier Brun Blanchard Giraud Joly Riviere Lucas Brunet Gaillard Barbier Arnaud Martinez Gerard Roche Renard Schmitt Roy Leroux Colin Vidal Caron Picard Roger Fabre Aubert Lemoine Renaud Dumas Lacroix Olivier Philippe Bourgeois Pierre Benoit Rey Leclerc Payet Rolland Leclercq Guillaume Lecomte Lopez Jean Dupuy Guillot Hubert Berger Carpentier Sanchez Dupuis Moulin Louis Deschamps Huet Vasseur Perez Boucher Fleury Royer Klein Jacquet Adam Paris Poirier Marty Aubry Guyot Carre Charles Renault Charpentier Menard Maillard Baron Bertin Bailly Herve Schneider Fernandez Le Collet Leger Bouvier Julien Prevost Millet Perrot Daniel Cousin Germain Breton Besson Langlois Remy Pelletier Leveque Perrier Leblanc Barre Lebrun Marchal Weber Mallet Hamon Boulanger Jacob Monnier Michaud Rodriguez Guichard Gillet Etienne Grondin Poulain Tessier Chevallier Collin Chauvin Bouchet Gay Lemaitre Benard Marechal Humbert Reynaud Antoine Hoarau Perret Barthelemy Cordier Pichon Lejeune Gilbert Lamy Delaunay Pasquier Carlier Laporte Gonzalez Alfonso Afonso Pereira Ferreira Oliveira Silva Santos Rodrigues Fernandes Gomes Martins Lopes Sousa Costa Ribeiro Carvalho Almeida Teixeira Correia Pinto Mendes Nunes Soares Vieira Moreira Cardoso Rocha Raposo Gonzales Hernandez Ramirez Torres Flores Rivera Gomez Diaz Morales Ortiz Jimenez Ruiz Alvarez Romero Navarro Dominguez Vazquez Ramos Gil Serrano Blanco Molina Castro Delgado Ortega Rubio Marin Sanz Iglesias Medina Garrido Cortes Castillo Santos Lozano Guerrero Cano Prieto Mendez Cruz Calvo Gallego Vidal Leon Herrera Marquez Pena Flores Cabrera Campos Vega Fuentes Carrasco Diez Caballero Reyes Nieto Aguilar Pascual Santana Herrero Lorenzo Montero Hidalgo Gimenez Ibanez Ferrer Duran Santiago Benitez Mora Vicente Vargas Arias Carmona Crespo Roman Pastor Soto Saez Velasco Moya Soler Parra Esteban Bravo Gallardo Rojas Etcheverry Etchegaray Etchebarne Etchepare Etcheto Etchebest Etchart Iriart Hiriart Elissalde Harispe Lafitte Larralde Arrieta Garat Irigoyen Ospital Dufau Darrigrand Duhalde Elizalde Goyheneche Haramboure Lacoste Lassalle Laborde Lasserre Larrieu Dumoulin Delmas Constant Constantin Laurence Florence Martine Josephine Marcel Claude Lucien Leon Jules Gabriel Raphael Thierry Valentin Mohamed Ahmed Ali Amar Hamidi Benali Belkacem Haddad Mansouri Saidi Bouzid Brahimi Cherif Khelifi Mebarki Rahmani Ziani Nguyen Tran Pham Le Kaya Yilmaz Demir Sahin Celik Dogan Ozturk Arslan Diallo Traore Diop Ndiaye Sow Keita Camara Toure Kone Coulibaly Cisse Sylla Diarra Fofana Lamarque'.split(' ').forEach(function (n) { PROTECT[key(n)] = 1; });

  function key(w) { return String(w).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, ''); }
  var BY_KEY = {}, BY_LEN = {};
  LIST.forEach(function (n) {
    var k = key(n);
    if (!k || BY_KEY[k]) return;
    BY_KEY[k] = n;
    (BY_LEN[k.length] = BY_LEN[k.length] || []).push(k);
  });

  // Letter pairs that OCR (and handwriting) often confuse: substituting one for the other costs half.
  var CONF = {};
  'HM HN MN MY NR UV UI VY OD OQ IL IJ IT EF EC CG RK SJ AR BR LT'.split(' ').forEach(function (p) {
    CONF[p[0] + p[1]] = CONF[p[1] + p[0]] = 1;
  });
  function wlev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d.push(new Array(n + 1)); d[i][0] = i; }
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      var s = a[i - 1] === b[j - 1] ? 0 : (CONF[a[i - 1] + b[j - 1]] ? 0.5 : 1);
      // a letter the reader dropped (present in the name, missing in the token) costs a bit less
      var v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 0.9, d[i - 1][j - 1] + s);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
    }
    return d[m][n];
  }
  function allowed(len) { return len <= 5 ? 0.5 : len <= 7 ? 1 : 2; }

  /* Exact first name (accent-insensitive): canonical spelling, else null. */
  function exact(w) { return BY_KEY[key(w)] || null; }
  /* Closest first name within the tolerance for this length, only if it is the unique best. */
  function closest(w, protect, maxDist) {
    var k = key(w);
    if (k.length < 4 || BY_KEY[k] || PROTECT[k] || (protect && protect[k])) return null;
    var lim = allowed(k.length), best = null, bd = 99, tie = false;
    for (var L = k.length - 1; L <= k.length + 1; L++) {
      var arr = BY_LEN[L]; if (!arr) continue;
      for (var i = 0; i < arr.length; i++) {
        var c = arr[i];
        // the first letter must match or be a usual confusion (S/J, M/H...): keeps SAULNIER from becoming GAUTHIER
        if (c[0] !== k[0] && !CONF[c[0] + k[0]]) continue;
        var dd = wlev(k, c);
        if (dd < bd) { bd = dd; best = c; tie = false; } else if (dd === bd) tie = true;
      }
    }
    if (!best || tie || bd > lim || (maxDist != null && bd > maxDist)) return null;
    return { name: BY_KEY[best], dist: bd };
  }
  /* Write a canonical name in the case style of the token it replaces. */
  function styled(canon, like) {
    var letters = String(like).replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letters && letters === letters.toUpperCase()) return canon.toUpperCase();
    return canon;
  }
  /* v10 — Suggestion only (never applied by itself): a common regional surname close to a word read from handwriting. */
  var SURN = Object.keys(PROTECT).filter(function (k) { return k.length >= 5 && !BY_KEY[k]; });
  function surname(w) {
    var k = key(w);
    if (k.length < 5 || PROTECT[k] || BY_KEY[k]) return null;
    var lim = Math.min(allowed(k.length), k.length >= 9 ? 1.5 : 1), best = null, bd = 99, tie = false;   // stricter than for first names: a real surname must not be 'corrected'
    for (var i = 0; i < SURN.length; i++) {
      var c = SURN[i];
      if (Math.abs(c.length - k.length) > 1 || (c[0] !== k[0] && !CONF[c[0] + k[0]])) continue;
      var dd = wlev(k, c);
      if (dd < bd) { bd = dd; best = c; tie = false; } else if (dd === bd) tie = true;
    }
    if (!best || tie || bd > lim) return null;
    var low = best.charAt(0) + best.slice(1).toLowerCase();
    return styled(low, w);
  }
  return { exact: exact, closest: closest, styled: styled, key: key, surname: surname, dist: wlev, allowed: allowed, size: Object.keys(BY_KEY).length, list: LIST };
})();
export { BalNames };
