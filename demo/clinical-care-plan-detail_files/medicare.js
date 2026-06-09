function isRrbNumberFormat(str){
  var mbiRegex = /^(a|d|h|ma|pa|wa|pd|wd|wca|wcd)([0-9]){6}$/i;
  return mbiRegex.test(str);
}

function isMbiNumberFormat(str){
  var mbiStrictRegex = /^([1-9])([ac-hj-km-np-rt-y])([0-9ac-hj-km-np-rt-y])([0-9])([ac-hj-km-np-rt-y])([0-9ac-hj-km-np-rt-y])([0-9])([ac-hj-km-np-rt-y]){2}([0-9]){2}$/i;
  return mbiStrictRegex.test(str);
}

function isHicnNumberFormat(str){
  var hicnStrictRegex = /^([0-9]){9}([a-fj-kmtw][1-9]|[a-fj-kmtw][abcdfghjklmnpqrstvwxyz]|[abdemtw])$/i;
  return hicnStrictRegex.test(str);
}