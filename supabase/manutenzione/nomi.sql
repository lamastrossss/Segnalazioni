-- Stage Review — nomi delle persone (quelli che compaiono su pin, board e foglio).
-- Scrivi una riga per persona: ('email', 'Nome Cognome'), separate da virgole. Poi Run.
-- Si può rieseguire quando aggiungi nuovi account: cambia solo i nomi indicati.
update public.profiles p
   set name = v.nome
  from auth.users u
  join (values
    ('alessandra.mastroeni@thewavestudio.it', 'Alessandra Mastroeni')
  , ('leonardo.maltese@thewavestudio.it', 'Leonardo Maltese')
  , ('simone.guccio@thewavestudio.it', 'Simone Guccio')
  , ('edoardo.benissimo@thewavestudio.it', 'Edoardo Benissimo')
  , ('simona.brancato@thewavestudio.it', 'Simona Brancato')
  , ('emanuela.figliuolo@thewavestudio.it', 'Emanuela Figliuolo')
  , ('giovanna.pavano@thewavestudio.it', 'Giovanna Pavano')
  , ('luca.valenti@thewavestudio.it', 'Luca Valenti')
  , ('michele.cocuccio@thewavestudio.it', 'Michele Cocuccio')
  , ('roberto.drago@thewavestudio.it', 'Roberto Drago')
  ) as v(email, nome) on lower(u.email) = lower(v.email)
 where p.id = u.id;

select u.email, p.name as nome
  from public.profiles p join auth.users u on u.id = p.id
 order by u.email;
