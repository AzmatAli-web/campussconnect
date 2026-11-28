// Public CUI Abbottabad material. The last three records are synthetic visibility controls.
const library='https://www.cuiatd.edu.pk/Website/junaid-zaidi-library';
const directory='https://www.cuiatd.edu.pk/Website/contact-us';
export const sources=[
 ['renew','How can I renew a library book?', 'Use the online library catalogue to renew a book.',library],
 ['card','Where can I register for a library card?', 'Ask the library help desk for registration assistance.',library],
 ['affairs','How do I phone Student Affairs?', 'Call the Student Affairs Section on 0992-383596.',directory],
 ['location','Where is the Abbottabad campus information desk?', 'The information desk is at Tobe Camp on University Road, Abbottabad.',directory],
 ['restricted','What is the amber pilot phrase?', 'The amber pilot phrase is sample alpha.','Fixture A','admin'],
 ['withdrawn','What is the violet pilot phrase?', 'The violet pilot phrase is sample beta.','Fixture B','campus','withdrawn'],
 ['foreign','What is the teal pilot phrase?', 'The teal pilot phrase is sample gamma.','Fixture C','campus','approved','other']
];
export const cases=[
 ...sources.slice(0,4).map(([key,question])=>({key,question,expected:key,group:'faq'})),
 {key:'renew-paraphrase',question:'Can I renew my borrowed library book online?',expected:'renew',group:'paraphrase'},
 {key:'affairs-paraphrase',question:'Which telephone number reaches the Student Affairs office?',expected:'affairs',group:'paraphrase'},
 {key:'missing-hours',question:'At what time does the library close on Fridays?',group:'unsupported'},
 {key:'missing-fee',question:'What is the replacement fee for a lost library card?',group:'unsupported'},
 ...sources.slice(4).map(([key,question])=>({key,question,group:'visibility'}))
];
