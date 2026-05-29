export type PaperNode = {
  id: string;
  title: string;
  author: string;
  year: number;
  citations: number;
  doi: string;
  owned: boolean;
  x: number;
  y: number;
};

export type Edge = { source: string; target: string };

export type UnmatchedPaper = {
  id: string;
  title: string;
  author: string;
  year: number;
};

export const mockNodes: PaperNode[] = [
  { id: "p1", title: "The Structure of Scientific Revolutions", author: "Kuhn, T.", year: 1962, citations: 128420, doi: "10.7208/9780226458144", owned: true, x: 420, y: 240 },
  { id: "p2", title: "Conjectures and Refutations", author: "Popper, K.", year: 1963, citations: 42180, doi: "10.4324/9780203538074", owned: true, x: 220, y: 160 },
  { id: "p3", title: "Against Method", author: "Feyerabend, P.", year: 1975, citations: 18230, doi: "10.5860/choice.13-5571", owned: false, x: 620, y: 180 },
  { id: "p4", title: "Objectivity", author: "Daston & Galison", year: 2007, citations: 6420, doi: "10.7551/mitpress/9780262042345", owned: true, x: 540, y: 380 },
  { id: "p5", title: "Epistemic Injustice", author: "Fricker, M.", year: 2007, citations: 9810, doi: "10.1093/acprof:oso/9780198237907.001.0001", owned: false, x: 320, y: 420 },
  { id: "p6", title: "Laboratory Life", author: "Latour & Woolgar", year: 1979, citations: 21540, doi: "10.1515/9781400820412", owned: true, x: 700, y: 320 },
  { id: "p7", title: "Science in Action", author: "Latour, B.", year: 1987, citations: 31200, doi: "10.4159/9780674040519", owned: false, x: 760, y: 440 },
  { id: "p8", title: "The Mangle of Practice", author: "Pickering, A.", year: 1995, citations: 8420, doi: "10.7208/9780226668253", owned: false, x: 480, y: 500 },
  { id: "p9", title: "Whose Science? Whose Knowledge?", author: "Harding, S.", year: 1991, citations: 11240, doi: "10.7591/9781501712951", owned: false, x: 160, y: 300 },
  { id: "p10", title: "Knowledge and Social Imagery", author: "Bloor, D.", year: 1976, citations: 7320, doi: "10.7208/9780226060989", owned: true, x: 260, y: 540 },
  { id: "p11", title: "Representing and Intervening", author: "Hacking, I.", year: 1983, citations: 10120, doi: "10.1017/CBO9780511814563", owned: false, x: 880, y: 260 },
  { id: "p12", title: "The Social Construction of Reality", author: "Berger & Luckmann", year: 1966, citations: 64210, doi: "10.4324/9781315775357", owned: false, x: 100, y: 460 },
  { id: "p13", title: "Reflexive Modernization", author: "Beck, Giddens, Lash", year: 1994, citations: 14320, doi: "10.1093/oso/9780804724739.001.0001", owned: false, x: 620, y: 580 },
  { id: "p14", title: "The Construction of Social Reality", author: "Searle, J.", year: 1995, citations: 9420, doi: "10.5860/choice.33-5160", owned: false, x: 380, y: 110 },
  { id: "p15", title: "Truth and Method", author: "Gadamer, H-G.", year: 1960, citations: 27410, doi: "10.5040/9781472547767", owned: false, x: 860, y: 540 },
];

export const mockEdges: Edge[] = [
  { source: "p1", target: "p2" }, { source: "p1", target: "p3" }, { source: "p1", target: "p4" },
  { source: "p1", target: "p6" }, { source: "p1", target: "p14" }, { source: "p2", target: "p3" },
  { source: "p2", target: "p9" }, { source: "p2", target: "p11" }, { source: "p3", target: "p11" },
  { source: "p3", target: "p15" }, { source: "p4", target: "p6" }, { source: "p4", target: "p8" },
  { source: "p5", target: "p9" }, { source: "p5", target: "p12" }, { source: "p5", target: "p10" },
  { source: "p6", target: "p7" }, { source: "p6", target: "p8" }, { source: "p7", target: "p8" },
  { source: "p7", target: "p13" }, { source: "p8", target: "p13" }, { source: "p9", target: "p10" },
  { source: "p9", target: "p12" }, { source: "p10", target: "p12" }, { source: "p11", target: "p15" },
  { source: "p13", target: "p15" }, { source: "p1", target: "p8" }, { source: "p4", target: "p13" },
  { source: "p2", target: "p14" },
];

export const mockUnmatched: UnmatchedPaper[] = [
  { id: "u1", title: "Notes on Garage Tinkering and Method", author: "Wexler, J.", year: 2011 },
  { id: "u2", title: "Field Notebook: Provisional Ontologies", author: "Marin, R.", year: 2018 },
  { id: "u3", title: "Letters on the Pragmatics of Doubt", author: "Okafor, A.", year: 2005 },
];
