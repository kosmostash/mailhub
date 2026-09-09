export type Override<A, B> = Omit<A, keyof B> & B;

export type StaticParams = {
  "collections/[id]": [ id: string | number ];
  "emails/[id]": [ id: string | number ];
  "account": [  ];
  "activity": [  ];
  "admins": [  ];
  "operators": [  ];
  "providers": [  ];
  "signin": [  ];
  "index": [  ];
};

export type LinkProps =
  | [ "collections/[id]", id: string | number ]
    | [ "emails/[id]", id: string | number ]
    | [ "account",  ]
    | [ "activity",  ]
    | [ "admins",  ]
    | [ "operators",  ]
    | [ "providers",  ]
    | [ "signin",  ]
    | [ "index",  ]
  ;
