import {interactiveTheoryTypes,IP_SUBNET_CARD} from '../../utils/interactiveTheoryCatalog.js';
import IpSubnetCard from './IpSubnetCard.jsx';
import IpSubnetSettings from './IpSubnetSettings.jsx';

// New trusted React components are registered here; the library discovers them.
export const interactiveTheoryRegistry = Object.freeze({
  [IP_SUBNET_CARD]:{...interactiveTheoryTypes[IP_SUBNET_CARD],Component:IpSubnetCard,Settings:IpSubnetSettings},
});
export const registeredInteractiveTheory = id => Object.hasOwn(interactiveTheoryRegistry,id||'')?interactiveTheoryRegistry[id]:null;
