import { CreditValidationError } from '../errors/credit.errors';
export class CreditMoney {
  private constructor(private readonly cents:number){}
  static zero(){ return new CreditMoney(0); }
  static from(value:string|number){
    const s=typeof value==='number'?value.toFixed(2):String(value).trim();
    if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(s)) throw new CreditValidationError('El monto monetario es inválido.',{value});
    const [w,f='']=s.split('.'); const cents=Number(w)*100+Number((f+'00').slice(0,2));
    if(!Number.isSafeInteger(cents)||cents<0) throw new CreditValidationError('El monto monetario está fuera de rango.',{value});
    return new CreditMoney(cents);
  }
  static fromCents(cents:number){ if(!Number.isSafeInteger(cents)||cents<0) throw new CreditValidationError('Monto inválido.'); return new CreditMoney(cents); }
  add(o:CreditMoney){ return CreditMoney.fromCents(this.cents+o.cents); }
  subtract(o:CreditMoney){ if(o.cents>this.cents) throw new CreditValidationError('El monto a restar supera el monto base.'); return CreditMoney.fromCents(this.cents-o.cents); }
  multiplyPercent(percent:string|number){ const p=Number(percent); if(!Number.isFinite(p)||p<0||p>100) throw new CreditValidationError('El porcentaje debe estar entre 0 y 100.'); return CreditMoney.fromCents(Math.round(this.cents*p/100)); }
  isGreaterThan(o:CreditMoney){ return this.cents>o.cents; }
  isLessThan(o:CreditMoney){ return this.cents<o.cents; }
  equals(o:CreditMoney){ return this.cents===o.cents; }
  isZero(){ return this.cents===0; }
  toString(){ return (this.cents/100).toFixed(2); }
}
