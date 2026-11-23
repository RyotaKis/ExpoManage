-- =============================================================================
-- ExpoManage : contrat d'exploitation version 2 (modèle rempli automatiquement)
-- À exécuter après 004_version_2.sql.
--
-- Crée un BROUILLON (non publié) pour chaque édition ouverte. Relisez-le dans
-- Administration › Configuration › Contrat d'exploitation, puis « Publier cette version ».
--
-- Les {{champs}} sont remplacés par les informations de la réservation :
--   {{exposant}} {{entreprise}} {{telephone}} {{edition}} {{lieu}} {{date_debut}} {{date_fin}}
--   {{duree}} {{categorie}} {{quantite}} {{prix_unitaire}} {{montant}} {{montant_lettres}}
--   {{numero}} {{date}} ; seuls sur leur ligne : {{tableau_produits}} (article 6)
--   et {{signature}} (mention d’acceptation électronique, datée et numérotée).
-- =============================================================================

insert into public.contrats (edition_id, version, titre, contenu)
select e.id,
       coalesce((select max(version) from public.contrats c where c.edition_id = e.id), 0) + 1,
       'Contrat d''exploitation des stands — ' || e.nom,
$contrat$# CONTRAT D’EXPLOITATION DES STANDS DU FENOU HIGBÉ

Entre les soussignés :

**FENOU INDUSTRIES**, sise à Ste Rita, Cotonou, Bénin,

- IFU : 0201810223035
- RCCM : N° RB/COT/18 A 35705
- Tél. : (229) 01 97 35 16 39

Représentée par sa Promotrice, Mme Sonita TOSSOU,

Ci-après dénommée « l’Organisateur »,

**ET**

M./Mme : {{exposant}}

Promoteur(trice) de : {{entreprise}}

Téléphone : {{telephone}}

Ci-après dénommé(e) « l’Entrepreneur »,

D’autre part.

Il a été convenu et arrêté ce qui suit :

## ARTICLE 1 : OBJET

Le présent contrat définit les modalités d’exploitation de stand(s) d’exposition par l’Entrepreneur dans le cadre du FENOU HIGBÉ ({{edition}}), le marché des jeunes entrepreneurs béninois.

## ARTICLE 2 : DURÉE

La durée du présent contrat pour l’exploitation du ou des stands est de {{duree}}, du {{date_debut}} au {{date_fin}}.

## ARTICLE 3 : OBLIGATIONS DE L’ENTREPRENEUR

L’Entrepreneur s’engage à :

- Procéder à l’installation complète et au branding de son stand au plus tard la veille de l’ouverture du marché.
- Promouvoir l’événement FENOU HIGBÉ ainsi que ses événements partenaires sur ses réseaux sociaux et sur son lieu de vente, avant et pendant l’événement.
- Ne pas vendre de produits concurrents à ceux des partenaires de l’événement, conformément aux indications de l’Organisateur.
- Payer la somme de {{montant_lettres}} ({{montant}}) francs CFA pour la réservation et l’exploitation de {{quantite}} stand(s) « {{categorie}} » au marché FENOU HIGBÉ. L’Entrepreneur reconnaît qu’aucune avance versée ne sera remboursée, quelles que soient les circonstances.
- Respecter l’image et la réputation de l’événement. À ce titre, toute communication publique, notamment sur les réseaux sociaux, doit demeurer respectueuse et ne pas porter atteinte à l’image du FENOU HIGBÉ, de ses organisateurs ou de ses partenaires, avant, pendant et après l’événement.
- Se conformer à toutes les normes sanitaires, légales et réglementaires en vigueur en République du Bénin, notamment en matière de sécurité des produits commercialisés et d’hygiène.

## ARTICLE 4 : OBLIGATIONS DE L’ORGANISATEUR

L’Organisateur s’engage à :

- Attribuer un stand d’exposition à l’Entrepreneur après le paiement des frais convenus.
- Mettre à disposition une source d’alimentation électrique pour le stand de l’Entrepreneur.
- Fournir à l’Entrepreneur une (01) table et deux (02) chaises pour son stand.

## ARTICLE 5 : SÉCURITÉ DES BIENS

L’Organisateur s’engage à assurer la sécurité générale de l’événement et des stands, notamment par la présence de personnel de sécurité sur le site du FENOU HIGBÉ.

Toutefois, il est fortement recommandé à chaque Entrepreneur de prendre des précautions particulières pour assurer la protection de ses biens de valeur. L’Organisateur conseille vivement aux Entrepreneurs de ramener leurs biens précieux à leur domicile à la fin de chaque journée.

Bien que l’Organisateur mette en place les mesures nécessaires pour sécuriser les lieux, il ne pourra être tenu responsable des pertes ou dommages éventuels survenant en dehors des heures d’ouverture de l’événement.

## ARTICLE 6 : DÉCLARATION DES ARTICLES À VENDRE ET DES ÉQUIPEMENTS

L’Entrepreneur s’engage à n’apporter sur le site de l’événement que les produits et équipements préalablement déclarés et mentionnés dans le tableau ci-dessous.

{{tableau_produits}}

## ARTICLE 7 : FORCE MAJEURE

L’Organisateur ne pourra être tenu responsable des retards, interruptions ou annulations dus à des événements de force majeure, tels que définis par la loi, incluant, sans s’y limiter, les catastrophes naturelles, les grèves, les épidémies ou tout autre événement imprévisible échappant au contrôle raisonnable de l’Organisateur.

## ARTICLE 8 : RÈGLEMENT DES LITIGES – JURIDICTION COMPÉTENTE

Tout litige pouvant survenir dans le cadre de l’exécution ou de l’interprétation du présent contrat sera, dans un premier temps, réglé à l’amiable entre les parties.

À défaut de règlement amiable, seul le Tribunal de Commerce de Cotonou sera compétent.

---

Fait à Cotonou, le {{date}}.

## POUR L’ORGANISATEUR

Mme Sonita TOSSOU, Promotrice de FENOU INDUSTRIES

## POUR L’ENTREPRENEUR

{{exposant}}, Promoteur(trice) de {{entreprise}}

{{signature}}$contrat$
from public.editions e
where e.statut = 'ouverte';
