import {interactiveTheoryTypes,IP_SUBNET_CARD} from '../../utils/interactiveTheoryCatalog.js';
import IpSubnetCard from './IpSubnetCard.jsx';
import IpSubnetSettings from './IpSubnetSettings.jsx';
import {DECIMAL_BINARY_CARD} from '../../utils/decimalBinary.js';
import DecimalBinaryCard from './DecimalBinaryCard.jsx';
import './DecimalBinaryCard.css';

// New trusted React components are registered here; the library discovers them.
export const interactiveTheoryRegistry = Object.freeze({
  [DECIMAL_BINARY_CARD]:{...interactiveTheoryTypes[DECIMAL_BINARY_CARD],Component:DecimalBinaryCard},
  [IP_SUBNET_CARD]:{...interactiveTheoryTypes[IP_SUBNET_CARD],Component:IpSubnetCard,Settings:IpSubnetSettings},
});
export const registeredInteractiveTheory = id => Object.hasOwn(interactiveTheoryRegistry,id||'')?interactiveTheoryRegistry[id]:null;
